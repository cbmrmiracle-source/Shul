CREATE TABLE "asset" (
	"id" serial PRIMARY KEY NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "content_item" (
	"id" serial PRIMARY KEY NOT NULL,
	"week_id" integer,
	"type" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_asset_id" integer,
	"link_url" text DEFAULT '' NOT NULL,
	"link_label" text DEFAULT '' NOT NULL,
	"event_date" date,
	"event_time" text DEFAULT '' NOT NULL,
	"hebrew_date" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"review_status" text DEFAULT 'approved' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"recurring_from" date,
	"recurring_until" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_week_skip" (
	"week_id" integer NOT NULL,
	"content_item_id" integer NOT NULL,
	CONSTRAINT "content_week_skip_week_id_content_item_id_pk" PRIMARY KEY("week_id","content_item_id")
);
--> statement-breakpoint
CREATE TABLE "person_date" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"external_key" text NOT NULL,
	"name_en" text DEFAULT '' NOT NULL,
	"name_he" text DEFAULT '' NOT NULL,
	"relation" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"hebrew_day" integer NOT NULL,
	"hebrew_month" integer NOT NULL,
	"hebrew_year" integer,
	"date_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_import" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"rows_imported" integer NOT NULL,
	"rows_skipped" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placement" (
	"id" serial PRIMARY KEY NOT NULL,
	"content_item_id" integer NOT NULL,
	"publication_id" integer NOT NULL,
	"variant" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"format" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_week_id_week_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."week"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_image_asset_id_asset_id_fk" FOREIGN KEY ("image_asset_id") REFERENCES "public"."asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_week_skip" ADD CONSTRAINT "content_week_skip_week_id_week_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."week"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_week_skip" ADD CONSTRAINT "content_week_skip_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement" ADD CONSTRAINT "placement_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_item_week" ON "content_item" USING btree ("week_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_item_week_source_ref" ON "content_item" USING btree ("week_id","source_ref") WHERE "content_item"."source_ref" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "person_date_kind_key" ON "person_date" USING btree ("kind","external_key");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_item_publication" ON "placement" USING btree ("content_item_id","publication_id");