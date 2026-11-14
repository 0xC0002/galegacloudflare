ALTER TABLE `received_events` ADD `next_attempt_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `received_events` ADD `first_attempt_at` integer DEFAULT 0 NOT NULL;