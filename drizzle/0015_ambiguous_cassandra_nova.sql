CREATE TABLE `whatsapp_recipient_config` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`change_token` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `whatsapp_recipients` (
	`phone` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`starts_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `house_whatsapp_jobs` ADD `recipient_phone` text;--> statement-breakpoint
ALTER TABLE `house_whatsapp_jobs` ADD `recipient_name` text;--> statement-breakpoint
ALTER TABLE `house_whatsapp_jobs` ADD `recipient_since` text;