CREATE TABLE `order_status_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`status` text NOT NULL,
	`actor` text NOT NULL,
	`confirmed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_status_reviews_order` ON `order_status_reviews` (`order_id`);