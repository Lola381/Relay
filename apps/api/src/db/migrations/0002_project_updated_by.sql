-- Who made the last change to a project (named in the 409 "X updated this project" message).
-- Added nullable, backfilled from created_by for existing rows, then made NOT NULL.
ALTER TABLE "projects" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
UPDATE "projects" SET "updated_by" = COALESCE("archived_by", "created_by");--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "updated_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
