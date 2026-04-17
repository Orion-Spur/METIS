CREATE TABLE "companyProfiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"mission" text NOT NULL,
	"products" text NOT NULL,
	"customers" text,
	"constraints" text,
	"teamSize" integer,
	"stage" varchar(128),
	"operatingModel" text,
	"geography" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companyProfiles_slug_unique" UNIQUE("slug")
);
