CREATE TABLE "store_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userid" varchar(255) NOT NULL,
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
	"updated_at" timestamp with time zone DEFAULT now()
);
