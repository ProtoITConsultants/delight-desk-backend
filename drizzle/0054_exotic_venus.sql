CREATE TABLE "woocommerce_webhook_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" varchar(100) NOT NULL,
	"wc_webhook_id" integer NOT NULL,
	"secret" text NOT NULL,
	"delivery_url" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_event_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "woocommerce_webhook_subscriptions" ADD CONSTRAINT "woocommerce_webhook_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;