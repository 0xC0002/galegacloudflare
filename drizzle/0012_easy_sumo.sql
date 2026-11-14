CREATE TABLE `house_whatsapp_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text,
	`revision` integer NOT NULL,
	`order_status` text NOT NULL,
	`state` text NOT NULL,
	`fingerprint` text,
	`body` text,
	`message_id` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`claim_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `house_whatsapp_order` ON `house_whatsapp_jobs` (`order_id`,`revision`);--> statement-breakpoint
CREATE INDEX `house_whatsapp_queue` ON `house_whatsapp_jobs` (`state`,`created_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`encrypted_token` text NOT NULL,
	`phone_id` text NOT NULL,
	`sender` text NOT NULL,
	`connected_at` text NOT NULL,
	`enabled_at` text,
	`enabled` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_run_at` integer DEFAULT 0 NOT NULL
);
