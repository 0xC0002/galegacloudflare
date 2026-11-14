CREATE TABLE `house_flavor_catalogs` (
	`kind` text PRIMARY KEY NOT NULL,
	`names` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
