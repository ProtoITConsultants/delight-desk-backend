CREATE TABLE "promo_code_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"promo_code" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"usage_type" text DEFAULT 'first_time_customer_discount' NOT NULL,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_percentage" numeric(5, 2),
	"max_refund_amount" numeric(12, 2),
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"minimum_order_value" numeric(12, 2),
	"max_usage_count" integer,
	"applies_to_subscriptions" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promo_code_configurations" ADD CONSTRAINT "promo_code_configurations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;