"use client";

import { useEffect } from "react";

export default function CollapseSidebarOnMount() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const checkbox = document.getElementById("sidebar-toggle") as
      | HTMLInputElement
      | null;
    if (checkbox) {
      checkbox.checked = true;
    }
  }, []);

  return null;
}
