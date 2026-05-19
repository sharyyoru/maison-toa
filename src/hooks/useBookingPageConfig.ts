"use client";

import { useEffect, useState } from "react";
import { DEFAULT_BOOKING_PAGES } from "@/components/PageBuilder/types";
import type { BookingPageId, PageConfig } from "@/components/PageBuilder/types";

function mergePageConfig(defaultConfig: PageConfig, savedConfig: Partial<PageConfig>): PageConfig {
  return {
    ...defaultConfig,
    ...savedConfig,
    settings: {
      ...defaultConfig.settings,
      ...savedConfig.settings,
    },
  };
}

export function useBookingPageConfig(pageId: BookingPageId) {
  const defaultConfig = DEFAULT_BOOKING_PAGES[pageId];
  const [pageConfig, setPageConfig] = useState<PageConfig>(defaultConfig);

  useEffect(() => {
    let isMounted = true;

    setPageConfig(defaultConfig);

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
  }, [defaultConfig, pageId]);

  return pageConfig;
}
