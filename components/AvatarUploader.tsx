"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { removeAvatar, uploadAvatar } from "@/lib/actions/avatar";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
/** What we'll try to decode at all; the upload itself is the 512 px re-encode. */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const OUTPUT_SIZE = 512;

/**
 * Centre-crops to a square and re-encodes at 512 px. Three reasons to do it
 * in the browser: a phone photo (4-8 MB) would exceed the 1 MB server-action
 * body limit; nobody needs more than 512 px for a circle this size; and
 * re-encoding drops EXIF, including the GPS position a phone embeds.
 */
async function toSquareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file); // honours EXIF orientation
  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(OUTPUT_SIZE, side);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Older Safari can't encode WebP and silently hands back a PNG instead.
  const webp = await encode("image/webp", 0.86);
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", 0.88);
  if (!jpeg) throw new Error("Could not encode the image");
  return jpeg;
}

interface AvatarProps {
  avatarUrl: string | null;
  initials: string;
  /** Pixel size of the circle. */
  size: number;
  className?: string;
}

/** The circle itself: photo when there is one (and it loads), initials otherwise. */
export function Avatar({ avatarUrl, initials, size, className = "" }: AvatarProps) {
  const [broken, setBroken] = useState<string | null>(null);
  return (
    <span
      className={`relative flex flex-none items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(140deg,var(--glow-600),#7c3aed)] font-semibold text-white ${className}`}
      style={{ width: size, height: size }}
    >
      {avatarUrl && broken !== avatarUrl ? (
        // Unoptimized: the source is already a 512 px upload or a Google
        // thumbnail, and this keeps blob/Google hosts out of next.config.
        <Image
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setBroken(avatarUrl)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

interface AvatarUploaderProps extends AvatarProps {
  /** False for the signed-out preview: shows the circle, offers no upload. */
  editable: boolean;
}

/**
 * Click the avatar to pick a photo. The new photo shows immediately from a
 * local preview while the upload runs; a failure puts the old one back.
 * The parent keys this on `avatarUrl`, so a server-side change resets it.
 */
export default function AvatarUploader({ avatarUrl, initials, size, className, editable }: AvatarUploaderProps) {
  const t = useTranslations("ProfileDashboard");
  const router = useRouter();
  const { update } = useSession();
  const input = useRef<HTMLInputElement>(null);
  // undefined = show the saved photo; string/null = optimistic override.
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const shown = override === undefined ? avatarUrl : override;

  // The page re-reads the profile row; the session (header, mobile app bar)
  // is refreshed separately, or those keep the old photo until next sign-in.
  const syncEverywhere = async () => {
    router.refresh();
    // {} is required: update() with no argument is a plain GET and never
    // runs auth.ts's trigger === "update" re-read of the row.
    await update({});
  };

  if (!editable) return <Avatar avatarUrl={avatarUrl} initials={initials} size={size} className={className} />;

  const onFile = async (file: File | undefined) => {
    if (input.current) input.current.value = ""; // so re-picking the same file fires again
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) return void toast.error(t("avatarErrorType"));
    if (file.size > MAX_SOURCE_BYTES) return void toast.error(t("avatarErrorSize"));

    let image: Blob;
    try {
      image = await toSquareImage(file);
    } catch {
      return void toast.error(t("avatarErrorType"));
    }

    const localPreview = URL.createObjectURL(image);
    setOverride(localPreview);
    setBusy(true);
    const form = new FormData();
    form.append("avatar", image, image.type === "image/webp" ? "avatar.webp" : "avatar.jpg");
    const result = await uploadAvatar(form).catch(() => null);
    setBusy(false);
    URL.revokeObjectURL(localPreview);

    if (!result?.ok) {
      setOverride(undefined);
      toast.error(t("avatarErrorFailed"));
      return;
    }
    setOverride(result.avatarUrl);
    toast.success(t("avatarSaved"));
    await syncEverywhere();
  };

  const onRemove = async () => {
    const before = override;
    setOverride(null);
    setBusy(true);
    const result = await removeAvatar().catch(() => null);
    setBusy(false);
    if (!result?.ok) {
      setOverride(before);
      toast.error(t("avatarErrorFailed"));
      return;
    }
    await syncEverywhere();
  };

  return (
    <span className="group/avatar relative flex-none" style={{ width: size, height: size }} data-avatar-uploader>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={shown ? t("avatarChange") : t("avatarUpload")}
        className="relative block rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/40"
      >
        <Avatar avatarUrl={shown} initials={initials} size={size} className={className} />
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-slate-950/55 text-[10.5px] font-semibold text-white transition-opacity duration-200 ${
            busy ? "opacity-100" : "opacity-0 group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100"
          }`}
        >
          {busy ? <Loader2 size={20} className="animate-spin" /> : <Camera size={18} strokeWidth={2} />}
          {!busy && (shown ? t("avatarChange") : t("avatarUpload"))}
        </span>
      </button>

      {/* Always-visible affordance, so the circle reads as editable before
          hover. Scaled to the circle and pushed onto its rim, so on a small
          avatar it doesn't sit on top of the initials. */}
      <span
        className="pointer-events-none absolute flex items-center justify-center rounded-full border-2 border-white bg-blue-700 text-white shadow-md dark:border-surface"
        style={{ width: Math.round(size * 0.32), height: Math.round(size * 0.32), right: -size * 0.04, bottom: -size * 0.04 }}
      >
        <Camera size={Math.max(10, Math.round(size * 0.15))} strokeWidth={2.2} />
      </span>

      {shown && !busy && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("avatarRemove")}
          title={t("avatarRemove")}
          data-avatar-remove
          className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-slate-900/10 bg-white text-slate-500 opacity-0 shadow-md transition-opacity duration-200 hover:text-red-600 focus-visible:opacity-100 group-hover/avatar:opacity-100 [@media(hover:none)]:opacity-100 dark:border-white/10 dark:bg-surface-3 dark:text-ink-muted dark:hover:text-red-400"
        >
          <Trash2 size={13} strokeWidth={2} />
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </span>
  );
}
