import type { Metadata } from "next";
import { InventoryConsole } from "@/features/inventory/components/inventory-console";
import { dashboardSchema } from "@/features/dashboard/types/dashboard";
export const metadata: Metadata = { title: "Inventory" };
export const dynamic = "force-dynamic";
export default function InventoryPage() {
  const threshold = dashboardSchema.shape.lowStockThreshold.parse(
    Number(process.env.DASHBOARD_LOW_STOCK_THRESHOLD ?? 5),
  );
  return <InventoryConsole threshold={threshold} />;
}
