CREATE TABLE "oauth_reauth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"provider" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_reauth_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "oauth_reauth_tokens" ADD CONSTRAINT "oauth_reauth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;