CREATE TYPE "public"."agent_name" AS ENUM('Metis', 'Athena', 'Argus', 'Loki');--> statement-breakpoint
CREATE TYPE "public"."council_message_role" AS ENUM('user', 'agent', 'synthesis');--> statement-breakpoint
CREATE TYPE "public"."council_session_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recommended_action" AS ENUM('proceed', 'revise', 'defer', 'escalate', 'request_clarification');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "councilMessages" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"sessionId" varchar(64) NOT NULL,
	"sequenceOrder" integer NOT NULL,
	"role" "council_message_role" NOT NULL,
	"agentName" "agent_name",
	"content" text NOT NULL,
	"confidence" numeric(4, 2),
	"recommendedAction" "recommended_action",
	"summaryRationale" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "councilSessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(255),
	"status" "council_session_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastMessageAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"username" varchar(64),
	"passwordHash" text,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "councilMessages" ADD CONSTRAINT "councilMessages_sessionId_councilSessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."councilSessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "councilSessions" ADD CONSTRAINT "councilSessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "council_messages_session_id_idx" ON "councilMessages" USING btree ("sessionId");--> statement-breakpoint
CREATE INDEX "council_messages_session_sequence_idx" ON "councilMessages" USING btree ("sessionId","sequenceOrder");--> statement-breakpoint
CREATE INDEX "council_sessions_user_id_idx" ON "councilSessions" USING btree ("userId");