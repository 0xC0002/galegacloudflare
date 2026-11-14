CREATE TABLE `independent_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `independent_sessions` (
	`digest` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `independent_session_user` ON `independent_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `independent_session_expiry` ON `independent_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `independent_setup` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `independent_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `independent_users_username_unique` ON `independent_users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `independent_users_email_unique` ON `independent_users` (`email`);