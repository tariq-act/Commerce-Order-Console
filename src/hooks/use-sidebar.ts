"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = "commerce-console.sidebar-collapsed";

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "true");
    } catch {
      /* Storage may be unavailable in private browsing. */
    }
    const breakpoint = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (breakpoint.matches) setMobileOpen(false);
    };
    breakpoint.addEventListener("change", closeOnDesktop);
    return () => breakpoint.removeEventListener("change", closeOnDesktop);
  }, []);

  const toggleCollapsed = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      /* Collapsing still works without persistence. */
    }
  }, [collapsed]);

  return { collapsed, toggleCollapsed, mobileOpen, setMobileOpen };
}
