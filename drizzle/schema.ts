import {
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const councilSessions = mysqlTable("councilSessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
});

export const councilMessages = mysqlTable("councilMessages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  sequenceOrder: int("sequenceOrder").notNull(),
  role: mysqlEnum("role", ["user", "agent", "synthesis"]).notNull(),
  agentName: mysqlEnum("agentName", ["Metis", "Athena", "Argus", "Loki"]),
  content: text("content").notNull(),
  confidence: decimal("confidence", { precision: 4, scale: 2 }),
  recommendedAction: mysqlEnum("recommendedAction", [
    "proceed",
    "revise",
    "defer",
    "escalate",
    "request_clarification",
  ]),
  summaryRationale: text("summaryRationale"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type CouncilSession = typeof councilSessions.$inferSelect;
export type InsertCouncilSession = typeof councilSessions.$inferInsert;

export type CouncilMessage = typeof councilMessages.$inferSelect;
export type InsertCouncilMessage = typeof councilMessages.$inferInsert;
