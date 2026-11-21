CREATE TABLE `inventory_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`type` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "inventory_movements_type_check" CHECK("inventory_movements"."type" IN ('ORDER_PLACED', 'ORDER_CANCELLED')),
	CONSTRAINT "inventory_movements_quantity_check" CHECK(typeof("inventory_movements"."quantity") = 'integer' AND "inventory_movements"."quantity" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_movements_order_product_type_unique` ON `inventory_movements` (`order_id`,`product_id`,`type`);--> statement-breakpoint
CREATE INDEX `inventory_movements_product_created_at_idx` ON `inventory_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "order_items_quantity_check" CHECK(typeof("order_items"."quantity") = 'integer' AND "order_items"."quantity" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "order_items_unit_price_cents_check" CHECK(typeof("order_items"."unit_price_cents") = 'integer' AND "order_items"."unit_price_cents" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_product_unique` ON `order_items` (`order_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_id_idx` ON `order_items` (`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference` text NOT NULL,
	`status` text DEFAULT 'PLACED' NOT NULL,
	`total_cents` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "orders_status_check" CHECK("orders"."status" IN ('PLACED', 'PACKED', 'SHIPPED', 'CANCELLED')),
	CONSTRAINT "orders_total_cents_check" CHECK(typeof("orders"."total_cents") = 'integer' AND "orders"."total_cents" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_reference_unique` ON `orders` (`reference`);--> statement-breakpoint
CREATE INDEX `orders_status_created_at_idx` ON `orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`price_cents` integer NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "products_price_cents_check" CHECK(typeof("products"."price_cents") = 'integer' AND "products"."price_cents" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "products_stock_check" CHECK(typeof("products"."stock") = 'integer' AND "products"."stock" BETWEEN 0 AND 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);