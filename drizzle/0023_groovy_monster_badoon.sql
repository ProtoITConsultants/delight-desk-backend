CREATE TABLE "ai_assistant_email_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"signature_name" text,
	"signature_title" text,
	"signature_company" text,
	"signature_company_url" text,
	"signature_email" text,
	"signature_phone_number" text,
	"html_signature" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_assistant_email_signatures_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "ai_assistant_email_signatures" ADD CONSTRAINT "ai_assistant_email_signatures_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;