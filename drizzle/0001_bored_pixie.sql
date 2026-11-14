CREATE TABLE `order_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`error` text,
	`actor` text NOT NULL,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_pending_action_per_order` ON `order_actions` (`order_id`) WHERE "order_actions"."status" IN ('SENDING', 'ACCEPTED', 'UNCERTAIN');--> statement-breakpoint
ALTER TABLE `received_orders` ADD `kitchen_stage` text DEFAULT 'WAITING' NOT NULL;--> statement-breakpoint
ALTER TABLE `received_orders` ADD `kitchen_updated_at` text;