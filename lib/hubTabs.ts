/** /hub views, in tab order. A plain module so the server page can validate ?tab= (see lib/profileTabs). */
export const HUB_TABS = ["exchange", "compare", "challenge", "digest"] as const;
export type HubTab = (typeof HUB_TABS)[number];
