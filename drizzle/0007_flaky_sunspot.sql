CREATE TABLE `receiver_health` (
	`id` text PRIMARY KEY NOT NULL,
	`last_attempt_at` text,
	`last_finished_at` text,
	`last_success_at` text,
	`last_error` text,
	`completed_runs` integer DEFAULT 0 NOT NULL
);
