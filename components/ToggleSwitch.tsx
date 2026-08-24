"use client";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  /** Tailwind background class applied when checked. Defaults to the site accent. */
  activeClassName?: string;
}

export default function ToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  activeClassName = "bg-blue-700",
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className={`relative h-7 w-[46px] flex-none rounded-full p-0 transition-colors duration-200 ${
        checked ? activeClassName : "bg-slate-900/[.16] dark:bg-white/20"
      }`}
    >
      <span
        className="absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow-[0_2px_5px_rgba(15,23,42,0.28)] transition-transform duration-200 ease-[cubic-bezier(.4,0,.2,1)]"
        style={{ transform: checked ? "translateX(18px)" : "translateX(0)" }}
      />
    </button>
  );
}
