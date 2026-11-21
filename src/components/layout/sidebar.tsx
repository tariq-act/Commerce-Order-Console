"use client";

import Link from "next/link";
import type { MouseEventHandler } from "react";
import { BookOpen, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isNavigationActive, navigationItems } from "@/lib/navigation";

type SidebarProps = {
  pathname: string;
  collapsed?: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
  onGuide: MouseEventHandler<HTMLButtonElement>;
  onToggle?: () => void;
};

export function Sidebar({
  pathname,
  collapsed = false,
  mobile = false,
  onNavigate,
  onGuide,
  onToggle,
}: SidebarProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          "flex h-[76px] shrink-0 items-center px-5",
          collapsed && "justify-center px-0",
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="Commerce Console overview"
          className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/25"
        >
          <BrandMark />
          {!collapsed && (
            <span className="text-[0.9375rem] font-semibold tracking-[-0.025em]">
              Commerce Console
              <span className="mt-0.5 block text-[0.8125rem] font-normal tracking-normal text-muted-foreground">
                Workspace
              </span>
            </span>
          )}
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-6">
        {!collapsed && (
          <p
            className="mb-3 px-3 text-xs font-semibold tracking-[0.13em] text-muted-foreground"
            aria-hidden="true"
          >
            WORKSPACE
          </p>
        )}
        <nav
          aria-label={mobile ? "Mobile navigation" : "Primary navigation"}
          className="space-y-1.5"
        >
          {navigationItems.map(({ label, href, icon: Icon }) => {
            const active = isNavigationActive(pathname, href);
            return (
              <div key={href} className="group relative">
                <Link
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-label={collapsed ? label : undefined}
                  aria-current={pathname === href ? "page" : active ? "location" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25",
                    active &&
                      "border-[#e8e5ff] bg-[#eeecff] text-[#5145b8] hover:bg-[#e9e6ff] hover:text-[#5145b8]",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon
                    className="size-[1.125rem] shrink-0"
                    strokeWidth={1.65}
                    aria-hidden="true"
                  />
                  <span className={collapsed ? "sr-only" : ""}>{label}</span>
                </Link>
                {href === "/orders" && !collapsed && (
                  <Link
                    href="/orders/new"
                    onClick={onNavigate}
                    aria-label="Open new order page"
                    title="New order"
                    className={cn(
                      "absolute top-2 right-2 flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-white/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                      active && "text-[#6558bd]",
                    )}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </div>
      <div className="shrink-0 p-3">
        <button
          type="button"
          onClick={onGuide}
          title={collapsed ? "Workspace guide" : undefined}
          aria-label={collapsed ? "Workspace guide" : undefined}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/25",
            collapsed && "justify-center px-0",
          )}
        >
          <BookOpen className="size-[1.125rem] shrink-0" strokeWidth={1.65} aria-hidden="true" />
          <span className={collapsed ? "sr-only" : ""}>Workspace guide</span>
        </button>
        {!mobile && (
          <div
            className={cn(
              "mt-3 flex items-center justify-between border-t border-border px-3 pt-4 pb-1",
              collapsed && "justify-center px-0",
            )}
          >
            {!collapsed && (
              <span className="text-[0.8125rem] text-muted-foreground">A little more clarity.</span>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-controls="desktop-sidebar"
              aria-expanded={!collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={onToggle}
            >
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
