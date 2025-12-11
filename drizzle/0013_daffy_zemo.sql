ALTER TABLE "agents" ADD COLUMN "type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_type_unique" UNIQUE("type");