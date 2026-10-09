"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function usePersistentDashboardView<const T extends string>({
  defaultValue,
  enabled = true,
  param = "view",
  storageKey,
  values,
}: {
  defaultValue: T;
  enabled?: boolean;
  param?: string;
  storageKey: string;
  values: readonly T[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get(param);
  const requestedValue = values.includes(requested as T) ? requested as T : null;
  const activeValue = requestedValue ?? defaultValue;

  useEffect(() => {
    if (!enabled) return;
    if (requestedValue) {
      window.localStorage.setItem(`pilotseal:dashboard-view:${storageKey}`, requestedValue);
      return;
    }

    const stored = window.localStorage.getItem(`pilotseal:dashboard-view:${storageKey}`);
    const nextValue = values.includes(stored as T) ? stored as T : defaultValue;
    const next = new URLSearchParams(searchParams.toString());
    next.set(param, nextValue);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [defaultValue, enabled, param, pathname, requestedValue, router, searchParams, storageKey, values]);

  function selectValue(value: T) {
    if (!enabled) return;
    window.localStorage.setItem(`pilotseal:dashboard-view:${storageKey}`, value);
    const next = new URLSearchParams(searchParams.toString());
    next.set(param, value);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return [activeValue, selectValue] as const;
}
