CREATE TABLE "api_rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" varchar(100) NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"limit_count" integer DEFAULT 5 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_rate_limits_user_endpoint_idx" ON "api_rate_limits" USING btree ("user_id","endpoint","reset_at");
