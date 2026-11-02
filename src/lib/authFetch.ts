"use client";

import { supabaseClient } from "@/lib/supabaseClient";

let installed = false;

// Wraps window.fetch so same-origin /api requests automatically carry the
// user's Supabase access token as a Bearer header. Existing Authorization
// headers are preserved. No-op on the server.
export function installAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const isApiCall =
      url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);

    if (!isApiCall) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    if (!headers.has("Authorization")) {
      try {
        const { data } = await supabaseClient.auth.getSession();
        const token = data.session?.access_token;
        if (token) headers.set("Authorization", `Bearer ${token}`);
      } catch {
        // no session — send unauthenticated; server will 401 if required
      }
    }

    return originalFetch(input, { ...init, headers });
  };
}
