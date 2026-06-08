"use client";

import Script from "next/script";
import { useEffect } from "react";

const GTM_ID = "GTM-KL5RWZP";

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];
const SESSION_KEY = "booking_tracking_params";

export function GoogleTagManager() {
  return (
    <>
      <Script
        id="gtm-script"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `,
        }}
      />
    </>
  );
}

export function GoogleTagManagerNoScript() {
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}

// Captures UTM/gclid/fbclid from URL on first landing and persists them in
// sessionStorage so they survive SPA navigation across booking steps.
// Also pushes them into the dataLayer on every page so GTM can read them.
export function TrackingParamsCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const stored = sessionStorage.getItem(SESSION_KEY);
    const existing: Record<string, string> = stored ? JSON.parse(stored) : {};

    // Capture any tracking params present in this URL
    let updated = false;
    for (const key of UTM_PARAMS) {
      const val = params.get(key);
      if (val && !existing[key]) {
        existing[key] = val;
        updated = true;
      }
    }
    if (updated) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(existing));
    }

    // Push all stored tracking params into dataLayer on every page
    if (Object.keys(existing).length > 0) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "tracking_params", ...existing });
    }
  }, []);

  return null;
}

// Helper function to push events to dataLayer
export function pushToDataLayer(event: string, data?: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    // Enrich every event with stored tracking params
    const stored = sessionStorage.getItem(SESSION_KEY);
    const trackingParams: Record<string, string> = stored ? JSON.parse(stored) : {};

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...trackingParams, ...data });
  }
}

// Type declaration for window.dataLayer
declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}
