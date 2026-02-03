CREATE TABLE "ai_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ai_agent_name" text NOT NULL,
	"business_type" text,
	"ai_agent_title" text,
	"email_salutation" text DEFAULT 'Hi' NOT NULL,
	"company_name_for_email_signature" text,
	"signature_footer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_identity_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "ai_identity" ADD CONSTRAINT "ai_identity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;