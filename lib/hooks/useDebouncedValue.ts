"use client";

import { useEffect, useState } from "react";

/**
 * The value, but only after it has stopped changing for `delay` ms.
 *
 * Used to keep the header search from firing a request per keystroke:
 * "134a" is one query, not four. The timer is cleared on every change and
 * on unmount, so a component that disappears mid-type never lands a late
 * update.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
