CREATE TABLE `dispute_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`dispute_id` text NOT NULL,
	`order_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`actor` text NOT NULL,
	`requested_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_response_per_dispute` ON `dispute_responses` (`dispute_id`) WHERE "dispute_responses"."status" != 'FAILED';--> statement-breakpoint
CREATE TABLE `dispute_settlements` (
	`event_id` text PRIMARY KEY NOT NULL,
	`dispute_id` text NOT NULL,
	`order_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integration_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`widget_id` text
);
--> statement-breakpoint
CREATE TABLE `order_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `received_events` ADD `negotiation_handled` integer DEFAULT 0 NOT NULL;