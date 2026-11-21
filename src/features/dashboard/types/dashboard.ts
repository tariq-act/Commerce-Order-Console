import { z } from "zod";

const integer = z.number().int().nonnegative();
export const dashboardSchema = z.object({
  metrics: z.object({
    totalOrders: integer,
    pendingOrders: integer,
    shippedOrders: integer,
    totalRevenueCents: integer,
  }),
  recentOrders: z
    .array(
      z.object({
        id: z.number().int().positive(),
        reference: z.string().min(1),
        status: z.enum(["PLACED", "PACKED", "SHIPPED", "CANCELLED"]),
        totalCents: integer,
        itemCount: integer,
        createdAt: z.iso.datetime(),
      }),
    )
    .max(5),
  lowStockProducts: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      sku: z.string(),
      stock: integer,
    }),
  ),
  lowStockThreshold: integer,
  generatedAt: z.iso.datetime(),
});

export type DashboardData = z.infer<typeof dashboardSchema>;
