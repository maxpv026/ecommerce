export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
}

export const FAQ_ENTRIES: FaqEntry[] = [
  {
    id: "faq1",
    question: "How do I track an active shipment?",
    answer:
      "Open Profile → Order History & Tracking and select the Active tab. Each in-transit order shows a live status stepper with the current hub and expected delivery window.",
  },
  {
    id: "faq2",
    question: "Do I need F-Gas certification to order?",
    answer:
      "Yes — F-Gas technician certification is verified before any refrigerant order ships. Upload your certificate once under Docs & Certs and it applies to every future order.",
  },
  {
    id: "faq3",
    question: "How does reverse-charge VAT work for EU orders?",
    answer:
      "Once your VAT ID is verified (Settings → VAT / Tax ID), eligible EU B2B orders are automatically billed at 0% VAT under the reverse-charge mechanism.",
  },
  {
    id: "faq4",
    question: "Can I change my delivery address after ordering?",
    answer:
      "Address changes are possible until an order reaches \"Processing.\" Contact support with your order number and we'll update the delivery site if the shipment hasn't left the hub yet.",
  },
  {
    id: "faq5",
    question: "What's your policy on A2L (mildly flammable) cylinders?",
    answer:
      "A2L refrigerants like R-32 ship with required placarding and require mildly-flammable refrigerant handling training on file, in line with F-Gas rules.",
  },
];
