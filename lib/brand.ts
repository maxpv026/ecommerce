/**
 * Public company constants shared by the footer (a client component) and the
 * /about page (a server component). Plain module on purpose: a value exported
 * from a "use client" file reaches a server component as a client reference,
 * not as the string.
 */

/**
 * The public addresses, in display order. myeenergy.com's MX is Resend
 * inbound; support@ is also the Reply-To of every email (EMAIL_REPLY_TO).
 * orders@ stays the sender only (lib/mail DEFAULT_FROM), not a contact.
 */
export const CONTACT_EMAILS = ["info@myeenergy.com", "support@myeenergy.com"] as const;

export const DEVELOPER = { name: "Maksym Pyvovarov", href: "https://github.com/maxpv026" } as const;
