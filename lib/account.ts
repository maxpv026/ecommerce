import type { AccountOrder, AccountProfile } from "./types";

// Placeholder account data — swap for a real session/API call later.
// Every consumer depends only on the AccountProfile/AccountOrder shape.
export const ACCOUNT_PROFILE: AccountProfile = {
  name: "Dana Mercer",
  companyLabel: "Mercer Mechanical",
  customerSinceYear: 2021,
  orderCount: 34,
  fields: [
    { key: "name", value: "Dana Mercer" },
    { key: "email", value: "dana@mercermechanical.com" },
    { key: "company", value: "Mercer Mechanical, LLC" },
    {
      key: "address",
      value: "4820 Sylvan Ave, Suite 210 · Dallas, TX 75247",
    },
  ],
  epaCert: {
    type: "Universal",
    expiresLabel: "March 2029",
    onFileSinceYear: 2021,
    verified: true,
  },
};

export const ACCOUNT_ORDERS: AccountOrder[] = [
  { id: "#HC-24817", date: "Aug 12, 2026", status: "In Transit", total: "$1,284.00" },
  { id: "#HC-24698", date: "Jul 28, 2026", status: "Delivered", total: "$618.00" },
  { id: "#HC-24512", date: "Jun 09, 2026", status: "Delivered", total: "$2,046.00" },
  { id: "#HC-24390", date: "May 21, 2026", status: "Delivered", total: "$342.00" },
];
