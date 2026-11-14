CREATE TABLE `integration_state` (
	`id` text PRIMARY KEY NOT NULL,
	`next_poll_at` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`encrypted_token` text,
	`token_expires_at` integer DEFAULT 0 NOT NULL,
	`last_poll_at` text,
	`last_success_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `received_events` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`code` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` text NOT NULL,
	`handled` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`processing_error` text
);
--> statement-breakpoint
CREATE TABLE `received_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`display_id` text NOT NULL,
	`merchant_id` text NOT NULL,
	`customer` text NOT NULL,
	`created_at` text NOT NULL,
	`received_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`cancelled` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL
);
