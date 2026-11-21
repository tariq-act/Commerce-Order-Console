import { Providers } from "@/components/providers";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
