CREATE TABLE "woocommerce_oauth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"store_url" text NOT NULL,
	"state" varchar(20) DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "woocommerce_oauth_attempts" ADD CONSTRAINT "woocommerce_oauth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "woocommerce_oauth_attempts_user_id_created_at_idx" ON "woocommerce_oauth_attempts" USING btree ("user_id","created_at");