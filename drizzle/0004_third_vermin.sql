CREATE INDEX `dispute_settlements_dispute_created` ON `dispute_settlements` (`dispute_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `dispute_settlements_order_created` ON `dispute_settlements` (`order_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_actions_order_requested` ON `order_actions` (`order_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `order_disputes_order` ON `order_disputes` (`order_id`);--> statement-breakpoint
CREATE INDEX `received_events_order_code` ON `received_events` (`order_id`,`code`);--> statement-breakpoint
CREATE INDEX `received_orders_received_at` ON `received_orders` (`received_at`);