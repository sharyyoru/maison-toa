"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BOOKING_PAGES } from "@/components/PageBuilder/types";
import type { BookingPageId, PageConfig } from "@/components/PageBuilder/types";
import { mergePageConfig } from "@/lib/bookingPageConfig";

export function useBookingPageConfig(pageId: BookingPageId, initialConfig?: PageConfig) {
  const defaultConfig = DEFAULT_BOOKING_PAGES[pageId];
  const [pageConfig, setPageConfig] = useState<PageConfig>(initialConfig ?? defaultConfig);

  useEffect(() => {
    let isMounted = true;

    setPageConfig(initialConfig ?? defaultConfig);

    fetch("/api/settings/content-translations", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;

        const savedPage = data?.bookingPages?.[pageId] ?? (pageId === "landing" ? data?.pageConfig : null);
        if (savedPage?.sections && Array.isArray(savedPage.sections)) {
          setPageConfig(mergePageConfig(defaultConfig, savedPage));
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [defaultConfig, initialConfig, pageId]);

  return pageConfig;
}
