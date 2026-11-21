import { db } from "./index";
import { products } from "./schema";
import type { NewProduct } from "./types";

// INR prices are expressed directly in integer paise.
const seedProducts = [
  {
    name: "Wireless Mouse",
    sku: "ACC-001",
    description: "A wireless mouse for comfortable everyday navigation at home or in the office.",
    priceCents: 79900,
    stock: 25,
  },
  {
    name: "Mechanical Keyboard",
    sku: "ACC-002",
    description: "A mechanical keyboard for responsive typing during work and gaming.",
    priceCents: 249900,
    stock: 10,
  },
  {
    name: "USB-C Hub",
    sku: "ACC-003",
    description:
      "A USB-C hub that expands laptop connectivity for everyday peripherals and desk accessories.",
    priceCents: 149900,
    stock: 15,
  },
  {
    name: "Monitor Stand",
    sku: "ACC-004",
    description:
      "A desktop stand that raises a monitor and creates space underneath for desk essentials.",
    priceCents: 119900,
    stock: 8,
  },
  {
    name: "Webcam HD",
    sku: "ACC-005",
    description:
      "An HD webcam for video meetings, online classes, and staying connected with family.",
    priceCents: 199900,
    stock: 0,
  },
  {
    name: "Laptop Sleeve",
    sku: "ACC-006",
    description:
      "A protective laptop sleeve for carrying a laptop between home, work, and study spaces.",
    priceCents: 59900,
    stock: 30,
  },
] satisfies NewProduct[];

try {
  // Skip existing SKUs entirely, preserving their current inventory and details.
  // One multi-row statement inserts all missing products atomically.
  const result = db
    .insert(products)
    .values(seedProducts)
    .onConflictDoNothing({ target: products.sku })
    .run();

  console.log(
    `Product seed complete: ${result.changes} inserted, ${seedProducts.length - result.changes} already present.`,
  );
} finally {
  db.$client.close();
}
