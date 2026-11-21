import type { createDatabase } from "./connection";
import type {
  inventoryMovements,
  inventoryMovementTypes,
  orderItems,
  orders,
  orderStatuses,
  products,
} from "./schema";

export type Database = ReturnType<typeof createDatabase>;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
export type OrderStatus = (typeof orderStatuses)[number];
export type InventoryMovementType = (typeof inventoryMovementTypes)[number];
