const SESSION_KEY = "booking_tracking_params";
const TRACKING_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid"];

export function getBookingTrackingParams(): Record<string, string> {
  if (typeof window === "undefined") return {};

  const params: Record<string, string> = {};

  // Prefer values from the current URL.
  const url = new URL(window.location.href);
  for (const key of TRACKING_KEYS) {
    const val = url.searchParams.get(key);
    if (val) params[key] = val;
  }

  // Merge with any params previously persisted across booking steps.
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      for (const key of TRACKING_KEYS) {
        if (!params[key] && typeof parsed[key] === "string") {
          params[key] = parsed[key];
        }
      }
    }
  } catch {
    // Ignore corrupted session storage.
  }

  // Infer Meta source when a fbclid is present or the referrer is Meta-owned.
  if (params.fbclid || document.referrer?.includes("facebook.com") || document.referrer?.includes("instagram.com")) {
    if (!params.utm_source) params.utm_source = "meta";
    if (!params.utm_medium) params.utm_medium = "paid_social";
  }

  return params;
}

export function storeBookingTrackingParams(): void {
  if (typeof window === "undefined") return;

  const params = getBookingTrackingParams();
  if (Object.keys(params).length > 0) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(params));
  }
}
