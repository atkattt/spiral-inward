import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  serial,
} from "drizzle-orm/pg-core"

// ---------------------------------------------------------------------------
// App tables — scoped per user via a plain `userId` column (no FK by design).
//
// `userId` holds the Supabase auth user id. Auth lives entirely in Supabase
// (Google OAuth only); Better Auth was never wired up, so its table
// declarations were removed. Nothing in this repo can push schema to the
// database — there is no drizzle-kit, config, or migration step.
// ---------------------------------------------------------------------------

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  birthDate: text("birthDate"),
  birthTime: text("birthTime"),
  birthTimeUnknown: boolean("birthTimeUnknown").notNull().default(false),
  birthPlace: text("birthPlace"),
  posX: integer("posX").notNull().default(50),
  posY: integer("posY").notNull().default(50),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

export const relationships = pgTable("relationships", {
  id: serial("id").primaryKey(),
  userId: text("userId").notNull(),
  fromPersonId: integer("fromPersonId").notNull(),
  toPersonId: integer("toPersonId").notNull(),
  kind: text("kind").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Per-user exploration progress for the explorable universe (Layer 4). Stores
// how far the "revealed frontier" has expanded from the center. One row per user.
export const userProgress = pgTable("user_progress", {
  userId: text("userId").primaryKey(),
  revealRadius: integer("revealRadius").notNull().default(240),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export type Person = typeof people.$inferSelect
export type Relationship = typeof relationships.$inferSelect
export type UserProgress = typeof userProgress.$inferSelect
