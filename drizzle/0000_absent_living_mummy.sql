CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"company" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"password_reset_token" varchar(64),
	"password_reset_expires_at" timestamp,
	"signature_name" text,
	"signature_title" text,
	"signature_company" text,
	"signature_company_url" text,
	"signature_phone" text,
	"signature_email" text,
	"signature_logo_url" text,
	"signature_photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" text NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"resolutions" integer NOT NULL,
	"cost_per_resolution" numeric(10, 2) NOT NULL,
	"email_limit" integer,
	"features" jsonb NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_oauth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"provider" text,
	"provider_user_id" text,
	"status" text DEFAULT 'connected' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"scopes" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_oauth_accounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "contact_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subject" text,
	"inquiry" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_store_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"store_name" varchar(255) NOT NULL,
	"store_url" varchar(255) NOT NULL,
	"api_key" varchar(255),
	"api_secret" varchar(255),
	"oauth_token" varchar(255),
	"oauth_token_secret" varchar(255),
	"oauth_verifier" varchar(255),
	"connection_method" varchar(50),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_store_connections" ADD CONSTRAINT "user_store_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;