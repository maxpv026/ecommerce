/**
 * The placeholder a route segment shows while its server data is in flight.
 *
 * A server component on purpose — it is only ever rendered on the server as a
 * Suspense fallback, so shipping it to the browser as JavaScript would be
 * paying for markup nobody interacts with.
 *
 * Deliberately grey boxes rather than a spinner: these segments already know
 * their shape, and reserving it stops the content arrival from shifting the
 * page (the "L" in Core Web Vitals is cheap to lose and hard to win back).
 */
export default function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex-1 animate-pulse px-4 py-6 md:px-8 md:py-10" aria-hidden>
      {/* Heading */}
      <div className="h-7 w-48 rounded-lg bg-black/5 dark:bg-white/10" />
      <div className="mt-2 h-4 w-72 max-w-full rounded-lg bg-black/5 dark:bg-white/10" />

      {/* Stat strip */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-black/5 dark:bg-white/10" />
        ))}
      </div>

      {/* Content rows */}
      <div className="mt-6 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-black/5 dark:bg-white/10" />
        ))}
      </div>
    </div>
  );
}
