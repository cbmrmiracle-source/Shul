ALTER TABLE "schedule_entry" ADD COLUMN "days" jsonb;--> statement-breakpoint
ALTER TABLE "week" ADD COLUMN "custom_order" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "week" ADD COLUMN "public_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "week" ADD CONSTRAINT "week_public_token_unique" UNIQUE("public_token");--> statement-breakpoint
-- House spelling: Shacharis -> Shachris (existing profiles and weeks)
UPDATE "schedule_slot" SET "label" = replace("label", 'Shacharis', 'Shachris') WHERE "label" LIKE '%Shacharis%';--> statement-breakpoint
UPDATE "schedule_entry" SET "label" = replace("label", 'Shacharis', 'Shachris') WHERE "label" LIKE '%Shacharis%';
