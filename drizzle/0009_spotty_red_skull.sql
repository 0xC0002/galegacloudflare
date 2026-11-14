CREATE TABLE `house_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	`ack_at` text,
	`ack_by` text,
	`stage` text
);
--> statement-breakpoint
CREATE TABLE `house_chat_reads` (
	`actor_key` text PRIMARY KEY NOT NULL,
	`last_read` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `house_commands` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `house_events` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`order_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`actor` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `house_events_id_unique` ON `house_events` (`id`);--> statement-breakpoint
CREATE TABLE `house_messages` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`sender_key` text NOT NULL,
	`sender_user_id` text NOT NULL,
	`sender_name` text NOT NULL,
	`body` text NOT NULL,
	`refs` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `house_messages_id_unique` ON `house_messages` (`id`);--> statement-breakpoint
CREATE TABLE `house_orders` (
	`number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_request` text NOT NULL,
	`creation_hash` text NOT NULL,
	`customer` text NOT NULL,
	`search_key` text NOT NULL,
	`phone` text NOT NULL,
	`modality` text NOT NULL,
	`timing` text NOT NULL,
	`service_date` text NOT NULL,
	`service_time` text NOT NULL,
	`promised_at` text NOT NULL,
	`prep_at` text NOT NULL,
	`lead_minutes` integer NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`released_at` text,
	`manager_seen_revision` integer DEFAULT 0 NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `house_orders_id_unique` ON `house_orders` (`id`);--> statement-breakpoint
CREATE INDEX `house_orders_day` ON `house_orders` (`service_date`,`service_time`);--> statement-breakpoint
CREATE INDEX `house_orders_due` ON `house_orders` (`status`,`prep_at`);--> statement-breakpoint
CREATE TABLE `house_print_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`claim_token` text,
	`station_id` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`completion` text
);
--> statement-breakpoint
CREATE INDEX `house_print_order` ON `house_print_jobs` (`order_id`,`revision`);--> statement-breakpoint
CREATE TABLE `house_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_minutes` integer DEFAULT 60 NOT NULL,
	`takeout_minutes` integer DEFAULT 20 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `house_stations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`name` text NOT NULL,
	`profile` text NOT NULL,
	`last_seen_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `house_users` (
	`email` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
