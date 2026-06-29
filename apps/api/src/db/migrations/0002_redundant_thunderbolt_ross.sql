CREATE TABLE "conditioning_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid,
	"modality" text NOT NULL,
	"distance_meters" numeric(10, 2),
	"duration_seconds" integer,
	"calories" integer,
	"intensity" text,
	"rpe" numeric(3, 1),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conditioning_logs" ADD CONSTRAINT "conditioning_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditioning_logs" ADD CONSTRAINT "conditioning_logs_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conditioning_logs_user_time_idx" ON "conditioning_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "conditioning_logs_workout_idx" ON "conditioning_logs" USING btree ("workout_id");