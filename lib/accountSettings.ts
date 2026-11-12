import "server-only";

import { auth } from "@/auth";
import { getUserAddresses, getUserProfile, type UserAddress, type UserProfileData } from "@/lib/data";
import { getSecurityState, type SecurityState } from "@/lib/actions/security";

/**
 * Everything the settings page renders, read once on the server — used by
 * /profile/settings, /notifications (desktop) and /profile/security.
 * `now` is the server's clock, passed down so relative times ("5 min ago")
 * render the same on the server and in the browser.
 */
export interface AccountSettingsData {
  profile: UserProfileData | null;
  security: SecurityState | null;
  addresses: UserAddress[];
  now: number;
}

export async function loadAccountSettings(): Promise<AccountSettingsData> {
  const session = await auth();
  const userId = session?.user?.id;
  const now = Date.now();
  if (!userId) return { profile: null, security: null, addresses: [], now };
  const [profile, security, addresses] = await Promise.all([getUserProfile(userId), getSecurityState(), getUserAddresses(userId)]);
  return { profile, security, addresses, now };
}
