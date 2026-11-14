ALTER TABLE `house_orders` ADD `kitchen_stage` text DEFAULT 'WAITING' NOT NULL;--> statement-breakpoint
ALTER TABLE `house_orders` ADD `kitchen_updated_at` text;