"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Bell, BookOpen, ChevronDown, Menu, Monitor, PanelLeft, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebar } from "@/hooks/use-sidebar";
import { getBreadcrumbs } from "@/lib/navigation";
import { Sidebar } from "./sidebar";
import { WorkspaceGuide } from "./workspace-guide";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useSidebar();
  const [guideOpen, setGuideOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const guideTrigger = useRef<HTMLElement | null>(null);
  const breadcrumbs = getBreadcrumbs(pathname);
  const openGuide = (trigger: HTMLElement | null) => {
    guideTrigger.current = trigger;
    setGuideOpen(true);
  };

  return (
    <div
      className="min-h-svh"
      style={{ "--sidebar-width": collapsed ? "76px" : "248px" } as CSSProperties}
    >
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside
        id="desktop-sidebar"
        aria-label="Workspace sidebar"
        className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-width)] border-r border-border bg-sidebar transition-[width] duration-200 motion-reduce:transition-none lg:block"
      >
        <Sidebar
          pathname={pathname}
          collapsed={collapsed}
          onToggle={toggleCollapsed}
          onGuide={(event) => openGuide(event.currentTarget)}
        />
      </aside>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          side="left"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!guideOpen) navigationTrigger.current?.focus();
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Workspace navigation</DialogTitle>
            <DialogDescription>Navigate Commerce Console sections.</DialogDescription>
          </DialogHeader>
          <Sidebar
            pathname={pathname}
            mobile
            onNavigate={() => setMobileOpen(false)}
            onGuide={() => {
              setMobileOpen(false);
              openGuide(navigationTrigger.current);
            }}
          />
        </DialogContent>
      </Dialog>
      <div className="min-w-0 transition-[padding] duration-200 motion-reduce:transition-none lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 border-b border-border bg-white/95 px-4 backdrop-blur-sm sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Button
              ref={navigationTrigger}
              variant="ghost"
              size="icon-lg"
              className="lg:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden lg:inline-flex"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-controls="desktop-sidebar"
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
            >
              <PanelLeft />
            </Button>
            <span className="hidden h-5 w-px bg-border lg:block" aria-hidden="true" />
            <nav aria-label="Breadcrumb" className="min-w-0">
              <ol className="flex min-w-0 items-center gap-2.5 text-sm">
                {breadcrumbs.map((crumb, index) => (
                  <li
                    key={`${crumb.label}-${index}`}
                    className={
                      index !== breadcrumbs.length - 1
                        ? "hidden items-center gap-2.5 sm:flex"
                        : "flex min-w-0 items-center gap-2.5 font-medium text-foreground"
                    }
                  >
                    {index > 0 && (
                      <span className="hidden text-border sm:inline" aria-hidden="true">
                        /
                      </span>
                    )}
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="truncate" aria-current="page">
                        {crumb.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-[0.8125rem] md:inline-flex"
              onClick={(event) => openGuide(event.currentTarget)}
            >
              <BookOpen />
              Workspace guide
            </Button>
            <span className="hidden h-5 w-px bg-border md:block" aria-hidden="true" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-lg" aria-label="Open notifications">
                  <Bell strokeWidth={1.65} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Notifications</h2>
                  <Badge variant="outline">Coming soon</Badge>
                </div>
                <div className="flex flex-col items-center px-2 py-7 text-center">
                  <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
                    <Bell className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-medium">A place for your updates</p>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    Workspace notifications will appear here when available.
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={profileTrigger}
                  type="button"
                  aria-label="Open profile menu"
                  className="flex min-h-11 items-center gap-2 rounded-lg px-1.5 outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/25"
                >
                  <span
                    className="flex size-8 items-center justify-center rounded-full border border-[#ddd9f2] bg-[#eeebfa] text-[0.8125rem] font-semibold text-[#62568e]"
                    aria-hidden="true"
                  >
                    C
                  </span>
                  <ChevronDown
                    className="hidden size-3 text-muted-foreground sm:block"
                    aria-hidden="true"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <span className="block text-sm font-semibold text-foreground">
                    Commerce Console
                  </span>
                  <span className="mt-0.5 block font-normal">Local workspace</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
                  <UserRound />
                  Workspace profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openGuide(profileTrigger.current)}>
                  <BookOpen />
                  Workspace guide
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <Monitor />
                  Appearance<span className="ml-auto text-muted-foreground">Light</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] px-5 py-7 outline-none sm:px-8 sm:py-9 lg:px-10 lg:py-10"
        >
          {children}
        </main>
        <footer className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-5 pt-1 pb-6 text-[0.8125rem] text-muted-foreground sm:px-8 lg:px-10">
          <span>Commerce Console</span>
          <span className="hidden sm:inline">A workspace for the work that matters.</span>
        </footer>
      </div>
      <WorkspaceGuide
        open={guideOpen}
        onOpenChange={setGuideOpen}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          guideTrigger.current?.focus();
        }}
      />
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            profileTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Workspace profile</DialogTitle>
            <DialogDescription>Your space for focused commerce operations.</DialogDescription>
          </DialogHeader>
          <dl className="divide-y divide-border rounded-xl border border-border px-5">
            <div className="flex flex-wrap justify-between gap-3 py-4 text-sm">
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="font-medium">Commerce Console</dd>
            </div>
            <div className="flex justify-between gap-3 py-4 text-sm">
              <dt className="text-muted-foreground">Appearance</dt>
              <dd>Light</dd>
            </div>
            <div className="flex justify-between gap-3 py-4 text-sm">
              <dt className="text-muted-foreground">Profile</dt>
              <dd>Local workspace</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            Account connection and profile preferences will be available here in the future.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
