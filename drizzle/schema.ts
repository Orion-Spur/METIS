import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const councilSessionStatusEnum = pgEnum("council_session_status", ["active", "archived"]);
export const councilMessageRoleEnum = pgEnum("council_message_role", ["user", "agent", "synthesis"]);
export const agentNameEnum = pgEnum("agent_name", ["Metis", "Athena", "Argus", "Loki"]);
export const recommendedActionEnum = pgEnum("recommended_action", [
  "proceed",
  "revise",
  "defer",
  "escalate",
  "request_clarification",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  username: varchar("username", { length: 64 }).unique(),
  passwordHash: text("passwordHash"),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const companyProfiles = pgTable("companyProfiles", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  mission: text("mission").notNull(),
  products: text("products").notNull(),
  customers: text("customers"),
  constraints: text("constraints"),
  teamSize: integer("teamSize"),
  stage: varchar("stage", { length: 128 }),
  operatingModel: text("operatingModel"),
  geography: text("geography"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export const councilSessions = pgTable(
  "councilSessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }),
    status: councilSessionStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastMessageAt: timestamp("lastMessageAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("council_sessions_user_id_idx").on(table.userId)]
);

export const councilMessages = pgTable(
  "councilMessages",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    sessionId: varchar("sessionId", { length: 64 })
      .notNull()
      .references(() => councilSessions.id, { onDelete: "cascade" }),
    sequenceOrder: integer("sequenceOrder").notNull(),
    role: councilMessageRoleEnum("role").notNull(),
    agentName: agentNameEnum("agentName"),
    content: text("content").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 2 }),
    recommendedAction: recommendedActionEnum("recommendedAction"),
    summaryRationale: text("summaryRationale"),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("council_messages_session_id_idx").on(table.sessionId),
    index("council_messages_session_sequence_idx").on(table.sessionId, table.sequenceOrder),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type InsertCompanyProfile = typeof companyProfiles.$inferInsert;

export type CouncilSession = typeof councilSessions.$inferSelect;
export type InsertCouncilSession = typeof councilSessions.$inferInsert;

export type CouncilMessage = typeof councilMessages.$inferSelect;
export type InsertCouncilMessage = typeof councilMessages.$inferInsert;
