import { Megaphone } from "lucide-react";
import { getActiveAnnouncement } from "@/lib/announcement";

/** The announcement strip above the site chrome (lib/announcement). Nothing when none is active. */
export default async function SiteAnnouncementBanner() {
  const text = await getActiveAnnouncement();
  if (!text) return null;
  return (
    <div role="status" className="border-b border-blue-700/20 bg-blue-700 text-white dark:border-blue-400/20 dark:bg-blue-600" data-site-announcement>
      <p className="m-0 mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2 text-center text-[13px] font-medium leading-[1.4] sm:px-8">
        <Megaphone size={14} strokeWidth={2.2} className="flex-none" />
        <span>{text}</span>
      </p>
    </div>
  );
}
