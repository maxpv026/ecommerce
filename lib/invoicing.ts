import "server-only";

import prisma from "@/lib/prisma";

/**
 * Issuing invoices and opening the cylinder ledger for a new order.
 *
 * Kept out of lib/orders.ts on purpose: commitOrder's transaction reserves
 * stock, and a failure there must roll the whole order back. Issuing a
 * billing document is a *separate* concern that must never be able to undo a
 * paid-for order — if the invoice write fails, the order still stands and the
 * document can be issued again later.
 */

/** Net payment terms for the bank-transfer flow these orders use. */
export const INVOICE_DUE_DAYS = 30;

export interface IssuedInvoice {
  invoiceId: string;
  invoiceNumber: string;
  /** Cylinders this order put into the customer's possession. */
  cylindersBorrowed: number;
  /** True when this call created the records; false when they already existed. */
  created: boolean;
}

/**
 * How many cylinders an order lends out.
 *
 * `depositAtPurchase > 0` is the signal, not the product category: a deposit
 * is charged precisely on returnable packaging, it is frozen onto the line at
 * checkout, and it keeps working if the catalogue is recategorised later.
 * Equipment and services carry no deposit and are correctly counted as zero.
 */
export function countBorrowedCylinders(
  items: Array<{ quantity: number; depositAtPurchase: unknown }>
): number {
  return items.reduce(
    (total, item) => total + (Number(item.depositAtPurchase) > 0 ? item.quantity : 0),
    0
  );
}

/** "INV-2026-0007" — year-scoped, zero-padded, ascending within the year. */
function formatInvoiceNumber(year: number, sequence: number): string {
  return `INV-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Issues the invoice for an order and records the cylinders it lends out.
 *
 * IDEMPOTENT, and that matters: this runs after checkout, may be retried by a
 * webhook or a support tool, and both effects are things you must never do
 * twice. A second invoice would break the legal one-document-per-sale rule; a
 * second BORROWED row would permanently overstate what the customer owes back.
 * The `Invoice.orderId` unique constraint is what actually enforces it — the
 * pre-check is just a fast path, and the constraint catches the race.
 */
export async function issueInvoiceForOrder(orderId: string): Promise<IssuedInvoice> {
  const existing = await prisma.invoice.findUnique({
    where: { orderId },
    select: { id: true, invoiceNumber: true },
  });
  if (existing) {
    const already = await prisma.cylinderTransaction.aggregate({
      where: { orderId, type: "BORROWED" },
      _sum: { quantity: true },
    });
    return {
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
      cylindersBorrowed: already._sum.quantity ?? 0,
      created: false,
    };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      userId: true,
      orderNumber: true,
      createdAt: true,
      items: { select: { quantity: true, depositAtPurchase: true } },
    },
  });
  if (!order) throw new Error(`issueInvoiceForOrder: order ${orderId} not found`);

  const cylinders = countBorrowedCylinders(order.items);
  const year = order.createdAt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  // The number is derived from a count, so two concurrent checkouts can pick
  // the same one. Rather than lock the table, let the unique index arbitrate
  // and retry — the same approach commitOrder uses for orderNumber.
  for (let attempt = 0; attempt < 5; attempt++) {
    const issuedThisYear = await prisma.invoice.count({
      where: { issuedAt: { gte: yearStart, lt: yearEnd } },
    });
    const invoiceNumber = formatInvoiceNumber(year, issuedThisYear + 1 + attempt);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            orderId,
            invoiceNumber,
            dueDate: new Date(Date.now() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000),
          },
          select: { id: true, invoiceNumber: true },
        });

        // Opening balance for this order. Written in the same transaction as
        // the invoice so an order can never end up billed but unledgered.
        if (cylinders > 0) {
          await tx.cylinderTransaction.create({
            data: {
              userId: order.userId,
              orderId,
              type: "BORROWED",
              quantity: cylinders,
              // Not "Issued with order X" — the ledger already renders the
              // order number as a link beside this, and repeating it read as
              // "ORD-3544-EU · Issued with order ORD-3544-EU".
              notes: "Issued at checkout",
            },
          });
        }

        return invoice;
      });

      return {
        invoiceId: result.id,
        invoiceNumber: result.invoiceNumber,
        cylindersBorrowed: cylinders,
        created: true,
      };
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      // P2002 on orderId means another call won the race — return its invoice.
      if (code === "P2002") {
        const winner = await prisma.invoice.findUnique({
          where: { orderId },
          select: { id: true, invoiceNumber: true },
        });
        if (winner) {
          return {
            invoiceId: winner.id,
            invoiceNumber: winner.invoiceNumber,
            cylindersBorrowed: cylinders,
            created: false,
          };
        }
        // Otherwise the collision was on invoiceNumber — try the next one.
        continue;
      }
      throw error;
    }
  }

  throw new Error(`issueInvoiceForOrder: could not allocate an invoice number for ${orderId}`);
}

/**
 * The customer's ledger: every movement, newest first, plus the balance.
 *
 * The balance is derived, never stored — that is the point of an append-only
 * ledger. A stored counter and a list of rows can disagree; a derived one
 * cannot.
 */
export interface CylinderLedgerEntry {
  id: string;
  type: "BORROWED" | "RETURNED" | "DEPOSIT_CHARGED" | "DEPOSIT_REFUNDED";
  quantity: number;
  notes: string | null;
  createdAt: string;
  orderId: string | null;
  orderNumber: string | null;
  /** Holding after this row, reading oldest → newest. */
  runningBalance: number;
}

export interface CylinderLedger {
  entries: CylinderLedgerEntry[];
  borrowed: number;
  returned: number;
  /** borrowed − returned. Never negative in practice; clamped for safety. */
  inPossession: number;
}

export async function getCylinderLedger(userId: string): Promise<CylinderLedger> {
  const rows = await prisma.cylinderTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      quantity: true,
      notes: true,
      createdAt: true,
      orderId: true,
      order: { select: { orderNumber: true } },
    },
  });

  let running = 0;
  let borrowed = 0;
  let returned = 0;

  const ascending = rows.map((row) => {
    // Only the two physical types move the count. The deposit types move
    // money against the same event and must not be double-counted as stock.
    if (row.type === "BORROWED") {
      running += row.quantity;
      borrowed += row.quantity;
    } else if (row.type === "RETURNED") {
      running -= row.quantity;
      returned += row.quantity;
    }
    return {
      id: row.id,
      type: row.type,
      quantity: row.quantity,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      orderId: row.orderId,
      orderNumber: row.order?.orderNumber ?? null,
      runningBalance: running,
    };
  });

  return {
    // Newest first for display; the running balance was computed oldest-first.
    entries: ascending.reverse(),
    borrowed,
    returned,
    inPossession: Math.max(0, borrowed - returned),
  };
}
