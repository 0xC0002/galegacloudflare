import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const integrationState = sqliteTable("integration_state", {
 id: text("id").primaryKey(), nextPollAt: integer("next_poll_at").notNull().default(0),
 leaseUntil: integer("lease_until").notNull().default(0), leaseOwner: text("lease_owner"),
 encryptedToken: text("encrypted_token"), tokenExpiresAt: integer("token_expires_at").notNull().default(0),
 lastPollAt: text("last_poll_at"), lastSuccessAt: text("last_success_at"), lastError: text("last_error"),
});
export const receivedEvents = sqliteTable("received_events", {
 id: text("id").primaryKey(), orderId: text("order_id"), code: text("code").notNull(),
 payload: text("payload").notNull(), receivedAt: text("received_at").notNull(),
 handled: integer("handled").notNull().default(0), attempts: integer("attempts").notNull().default(0), processingError: text("processing_error"),
 negotiationHandled: integer("negotiation_handled").notNull().default(0),
 nextAttemptAt: integer("next_attempt_at").notNull().default(0), firstAttemptAt: integer("first_attempt_at").notNull().default(0),
 acknowledgedAt: text("acknowledged_at"),
},table=>[index("received_events_order_code").on(table.orderId,table.code)]);
export const receivedOrders = sqliteTable("received_orders", {
 id: text("id").primaryKey(), displayId: text("display_id").notNull(), merchantId: text("merchant_id").notNull(),
 customer: text("customer").notNull(), createdAt: text("created_at").notNull(), receivedAt: text("received_at").notNull(),
 updatedAt: text("updated_at").notNull(), cancelled: integer("cancelled").notNull().default(0), payload: text("payload").notNull(),
 kitchenStage: text("kitchen_stage").notNull().default("WAITING"), kitchenUpdatedAt: text("kitchen_updated_at"),
 kitchenNeedsReview: integer("kitchen_needs_review").notNull().default(0),
},table=>[index("received_orders_received_at").on(table.receivedAt)]);
export const orderActions = sqliteTable("order_actions", {
 id: text("id").primaryKey(), orderId: text("order_id").notNull(), action: text("action").notNull(),
 status: text("status").notNull(), reason: text("reason"), error: text("error"), actor: text("actor").notNull(),
 requestedAt: text("requested_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("one_pending_action_per_order").on(table.orderId).where(sql`${table.status} IN ('SENDING', 'ACCEPTED', 'UNCERTAIN')`),index("order_actions_order_requested").on(table.orderId,table.requestedAt)]);
export const orderDisputes = sqliteTable("order_disputes", {
 id: text("id").primaryKey(), orderId: text("order_id").notNull(), payload: text("payload").notNull(),
 createdAt: text("created_at").notNull(), expiresAt: text("expires_at").notNull(),
},table=>[index("order_disputes_order").on(table.orderId)]);
export const disputeSettlements = sqliteTable("dispute_settlements", {
 eventId: text("event_id").primaryKey(), disputeId: text("dispute_id").notNull(), orderId: text("order_id").notNull(),
 payload: text("payload").notNull(), createdAt: text("created_at").notNull(),
},table=>[index("dispute_settlements_dispute_created").on(table.disputeId,table.createdAt),index("dispute_settlements_order_created").on(table.orderId,table.createdAt)]);
export const disputeResponses = sqliteTable("dispute_responses", {
 id: text("id").primaryKey(), disputeId: text("dispute_id").notNull(), orderId: text("order_id").notNull(),
 action: text("action").notNull(), payload: text("payload").notNull(), status: text("status").notNull(),
 error: text("error"), actor: text("actor").notNull(), requestedAt: text("requested_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("one_response_per_dispute").on(table.disputeId).where(sql`${table.status} != 'FAILED'`)]);
export const integrationPreferences = sqliteTable("integration_preferences", {
 id: text("id").primaryKey(), widgetId: text("widget_id"),
});
export const receiverHealth = sqliteTable("receiver_health", {
 id:text("id").primaryKey(),lastAttemptAt:text("last_attempt_at"),lastFinishedAt:text("last_finished_at"),lastSuccessAt:text("last_success_at"),lastError:text("last_error"),completedRuns:integer("completed_runs").notNull().default(0),
});
export const orderStatusReviews = sqliteTable("order_status_reviews", {
 id:text("id").primaryKey(),orderId:text("order_id").notNull(),status:text("status").notNull(),
 actor:text("actor").notNull(),confirmedAt:text("confirmed_at").notNull(),
},table=>[uniqueIndex("order_status_reviews_order").on(table.orderId)]);

export const houseUsers=sqliteTable("house_users",{email:text("email").primaryKey(),userId:text("user_id"),name:text("name").notNull(),role:text("role").notNull(),active:integer("active").notNull().default(1),updatedAt:text("updated_at").notNull()});
export const houseStations=sqliteTable("house_stations",{id:text("id").primaryKey(),userId:text("user_id").notNull(),deviceId:text("device_id").notNull(),name:text("name").notNull(),profile:text("profile").notNull(),lastSeenAt:text("last_seen_at").notNull()});
export const houseSettings=sqliteTable("house_settings",{id:text("id").primaryKey(),deliveryMinutes:integer("delivery_minutes").notNull().default(60),takeoutMinutes:integer("takeout_minutes").notNull().default(20),revision:integer("revision").notNull().default(1),updatedAt:text("updated_at").notNull()});
export const houseFlavorCatalogs=sqliteTable("house_flavor_catalogs",{kind:text("kind").primaryKey(),names:text("names").notNull(),revision:integer("revision").notNull().default(1),updatedAt:text("updated_at").notNull()});
export const houseOrders=sqliteTable("house_orders",{number:integer("number").primaryKey({autoIncrement:true}),id:text("id").notNull().unique(),revision:integer("revision").notNull().default(1),lastRequest:text("last_request").notNull(),creationHash:text("creation_hash").notNull(),customer:text("customer").notNull(),searchKey:text("search_key").notNull(),phone:text("phone").notNull(),modality:text("modality").notNull(),timing:text("timing").notNull(),serviceDate:text("service_date").notNull(),serviceTime:text("service_time").notNull(),promisedAt:text("promised_at").notNull(),prepAt:text("prep_at").notNull(),leadMinutes:integer("lead_minutes").notNull(),status:text("status").notNull(),kitchenStage:text("kitchen_stage").notNull().default("WAITING"),kitchenUpdatedAt:text("kitchen_updated_at"),payload:text("payload").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),releasedAt:text("released_at"),managerSeenRevision:integer("manager_seen_revision").notNull().default(0),updatedBy:text("updated_by").notNull()},t=>[index("house_orders_day").on(t.serviceDate,t.serviceTime),index("house_orders_due").on(t.status,t.prepAt)]);
export const houseCommands=sqliteTable("house_commands",{id:text("id").primaryKey(),orderId:text("order_id").notNull(),actorKey:text("actor_key").notNull(),fingerprint:text("fingerprint").notNull(),createdAt:text("created_at").notNull()});
export const houseEvents=sqliteTable("house_events",{number:integer("number").primaryKey({autoIncrement:true}),id:text("id").notNull().unique(),orderId:text("order_id").notNull(),revision:integer("revision").notNull(),kind:text("kind").notNull(),actor:text("actor").notNull(),detail:text("detail").notNull(),createdAt:text("created_at").notNull()},t=>[index("house_events_order_revision_kind").on(t.orderId,t.revision,t.kind)]);
export const houseAlerts=sqliteTable("house_alerts",{id:text("id").primaryKey(),orderId:text("order_id").notNull(),revision:integer("revision").notNull(),kind:text("kind").notNull(),detail:text("detail").notNull(),createdAt:text("created_at").notNull(),ackAt:text("ack_at"),ackBy:text("ack_by"),stage:text("stage")},t=>[index("house_alerts_kind_created").on(t.kind,t.createdAt)]);
export const housePrintJobs=sqliteTable("house_print_jobs",{id:text("id").primaryKey(),orderId:text("order_id").notNull(),revision:integer("revision").notNull(),kind:text("kind").notNull(),state:text("state").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),claimToken:text("claim_token"),stationId:text("station_id"),leaseUntil:integer("lease_until").notNull().default(0),completion:text("completion")},t=>[index("house_print_order").on(t.orderId,t.revision)]);
export const houseMessages=sqliteTable("house_messages",{number:integer("number").primaryKey({autoIncrement:true}),id:text("id").notNull().unique(),senderKey:text("sender_key").notNull(),senderUserId:text("sender_user_id").notNull(),senderName:text("sender_name").notNull(),body:text("body").notNull(),refs:text("refs").notNull(),createdAt:text("created_at").notNull()});
export const houseChatReads=sqliteTable("house_chat_reads",{actorKey:text("actor_key").primaryKey(),lastRead:integer("last_read").notNull().default(0),updatedAt:text("updated_at").notNull()});

// User-owned Meta connection. Only an authenticated owner may replace it.
// The token is AES-GCM encrypted; the encryption key lives in Sites secrets.
export const whatsappConnection=sqliteTable("whatsapp_connection",{
 id:text("id").primaryKey(), encryptedToken:text("encrypted_token").notNull(),
 phoneId:text("phone_id").notNull(), sender:text("sender").notNull(),
 connectedAt:text("connected_at").notNull(), enabledAt:text("enabled_at"),
 enabled:integer("enabled").notNull().default(0),
 leaseOwner:text("lease_owner"),leaseUntil:integer("lease_until").notNull().default(0),
 nextRunAt:integer("next_run_at").notNull().default(0),
});
export const whatsappRecipientConfig=sqliteTable("whatsapp_recipient_config",{
 id:text("id").primaryKey(),revision:integer("revision").notNull().default(0),changeToken:text("change_token"),updatedAt:text("updated_at").notNull(),
});
export const whatsappRecipients=sqliteTable("whatsapp_recipients",{
 phone:text("phone").primaryKey(),name:text("name").notNull(),active:integer("active").notNull().default(1),
 startsAt:text("starts_at").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
});
export const houseWhatsappJobs=sqliteTable("house_whatsapp_jobs",{
 id:text("id").primaryKey(),orderId:text("order_id"),revision:integer("revision").notNull(),
 orderStatus:text("order_status").notNull(),state:text("state").notNull(),
 fingerprint:text("fingerprint"),body:text("body"),messageId:text("message_id"),
 error:text("error"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
 claimToken:text("claim_token"),leaseUntil:integer("lease_until").notNull().default(0),
 recipientPhone:text("recipient_phone"),recipientName:text("recipient_name"),recipientSince:text("recipient_since"),
 sentParts:integer("sent_parts").notNull().default(0),totalParts:integer("total_parts").notNull().default(0),manualParts:integer("manual_parts").notNull().default(0),
},t=>[index("house_whatsapp_order").on(t.orderId,t.revision),index("house_whatsapp_queue").on(t.state,t.createdAt)]);

// Independent Cloudflare access. No ChatGPT session or platform tokens.
export const independentUsers=sqliteTable('independent_users',{
 id:text('id').primaryKey(),username:text('username').notNull().unique(),email:text('email').notNull().unique(),name:text('name').notNull(),role:text('role').notNull(),passwordHash:text('password_hash').notNull(),active:integer('active').notNull().default(1),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),
});
export const independentSessions=sqliteTable('independent_sessions',{
 digest:text('digest').primaryKey(),userId:text('user_id').notNull(),expiresAt:integer('expires_at').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('independent_session_user').on(t.userId),index('independent_session_expiry').on(t.expiresAt)]);
export const independentAttempts=sqliteTable('independent_attempts',{
 key:text('key').primaryKey(),count:integer('count').notNull(),resetAt:integer('reset_at').notNull(),
});
export const independentSetup=sqliteTable('independent_setup',{id:text('id').primaryKey(),createdAt:integer('created_at').notNull()});
