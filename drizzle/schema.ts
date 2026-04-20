import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  type AnyPgColumn,
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

export const learningKindEnum = pgEnum("learning_kind", [
  "decision",
  "principle",
  "risk",
  "open_question",
  "rejected_option",
  "commitment",
]);

export const learningConfidenceEnum = pgEnum("learning_confidence", [
  "firm",
  "provisional",
  "exploratory",
]);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    username: varchar("username", { length: 64 }).unique(),
    passwordHash: text("passwordHash"),
    name: text("name"),
    email: varchar("email", { length: 320 }).unique(),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: userRoleEnum("role").default("user").notNull(),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("users_role_active_idx").on(table.role, table.isActive)]
);

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
    summary: text("summary"),
    status: councilSessionStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    lastMessageAt: timestamp("lastMessageAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("council_sessions_user_id_idx").on(table.userId),
    index("council_sessions_user_updated_idx").on(table.userId, table.updatedAt),
  ]
);

export const councilLearnings = pgTable(
  "councilLearnings",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("sessionId", { length: 64 })
      .notNull()
      .references(() => councilSessions.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: learningKindEnum("kind").notNull(),
    statement: text("statement").notNull(),
    confidence: learningConfidenceEnum("confidence").default("provisional").notNull(),
    supportingAgents: text("supportingAgents"),
    dissent: text("dissent"),
    rationale: text("rationale"),
    tags: text("tags"),
    supersedesId: integer("supersedesId").references(
      (): AnyPgColumn => councilLearnings.id,
      { onDelete: "set null" }
    ),
    supersededAt: timestamp("supersededAt", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("council_learnings_user_kind_idx").on(table.userId, table.kind),
    index("council_learnings_user_updated_idx").on(table.userId, table.updatedAt),
    index("council_learnings_session_id_idx").on(table.sessionId),
  ]
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
    memoryInterventionLearningId: integer("memoryInterventionLearningId").references(
      () => councilLearnings.id,
      { onDelete: "set null" }
    ),
    memoryInterventionReason: text("memoryInterventionReason"),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("council_messages_session_id_idx").on(table.sessionId),
    index("council_messages_session_sequence_idx").on(table.sessionId, table.sequenceOrder),
  ]
);

export const sessionInsights = pgTable(
  "sessionInsights",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("sessionId", { length: 64 })
      .notNull()
      .references(() => councilSessions.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    insight: text("insight").notNull(),
    rationale: text("rationale"),
    tags: text("tags"),
    createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("session_insights_user_created_idx").on(table.userId, table.createdAt),
    index("session_insights_session_id_idx").on(table.sessionId),
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

export type SessionInsight = typeof sessionInsights.$inferSelect;
export type InsertSessionInsight = typeof sessionInsights.$inferInsert;

export type CouncilLearning = typeof councilLearnings.$inferSelect;
export type InsertCouncilLearning = typeof councilLearnings.$inferInsert;
