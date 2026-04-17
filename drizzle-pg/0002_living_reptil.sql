CREATE TABLE "sessionInsights" (
	"id" serial PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"insight" text NOT NULL,
	"rationale" text,
	"tags" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "councilSessions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sessionInsights" ADD CONSTRAINT "sessionInsights_sessionId_councilSessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."councilSessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessionInsights" ADD CONSTRAINT "sessionInsights_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_insights_user_created_idx" ON "sessionInsights" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "session_insights_session_id_idx" ON "sessionInsights" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "council_sessions_user_updated_idx" ON "councilSessions" USING btree ("userId","updatedAt");--> statement-breakpoint
CREATE INDEX "users_role_active_idx" ON "users" USING btree ("role","isActive");