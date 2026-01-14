CREATE TABLE "aftership_trackings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"tracking_number" varchar(128) NOT NULL,
	"carrier_slug" varchar(64) NOT NULL,
	"aftership_tracking_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "aftership_trackings_order_tracking_unique" ON "aftership_trackings" USING btree ("order_id","tracking_number");--> statement-breakpoint
CREATE INDEX "aftership_trackings_tracking_number_idx" ON "aftership_trackings" USING btree ("tracking_number");