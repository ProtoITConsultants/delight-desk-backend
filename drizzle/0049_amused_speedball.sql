CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "product_knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"content_hash" varchar(64) NOT NULL,
	"status" varchar(30) DEFAULT 'processing' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"token_count" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_knowledge_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dimensions" integer DEFAULT 1536 NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product_knowledge_sources" ADD CONSTRAINT "product_knowledge_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_chunks" ADD CONSTRAINT "product_knowledge_chunks_source_id_product_knowledge_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."product_knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_chunks" ADD CONSTRAINT "product_knowledge_chunks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_embeddings" ADD CONSTRAINT "product_knowledge_embeddings_chunk_id_product_knowledge_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."product_knowledge_chunks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_knowledge_embeddings" ADD CONSTRAINT "product_knowledge_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_knowledge_sources_user_id_idx" ON "product_knowledge_sources" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_knowledge_sources_content_hash_idx" ON "product_knowledge_sources" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "product_knowledge_sources_status_idx" ON "product_knowledge_sources" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "product_knowledge_chunks_user_id_idx" ON "product_knowledge_chunks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "product_knowledge_chunks_source_id_idx" ON "product_knowledge_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_knowledge_chunks_source_index_uidx" ON "product_knowledge_chunks" USING btree ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "product_knowledge_embeddings_user_id_idx" ON "product_knowledge_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_knowledge_embeddings_chunk_id_uidx" ON "product_knowledge_embeddings" USING btree ("chunk_id");--> statement-breakpoint
CREATE INDEX "product_knowledge_embeddings_vector_idx" ON "product_knowledge_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);