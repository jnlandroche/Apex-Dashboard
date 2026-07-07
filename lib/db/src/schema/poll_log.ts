import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Persisted poll log — previously kept in-memory only, which meant every
// Replit redeploy/restart wiped debugging history. Now survives restarts.
export const pollLogTable = pgTable(
  "poll_log",
  {
    id: serial("id").primaryKey(),
    playerName: text("player_name").notNull(),
    platform: text("platform").notNull(),
    endpoint: text("endpoint").notNull(),
    status: text("status").notNull(), // "success" | "error" | "rate_limited" | "not_found" | "private"
    httpStatus: integer("http_status"),
    errorMessage: text("error_message"),
    kills: integer("kills"),
    damage: integer("damage"),
    rankScore: integer("rank_score"),
    rankName: text("rank_name"),
    rawPreview: text("raw_preview"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("poll_log_created_at_idx").on(table.createdAt)],
);

export const insertPollLogSchema = createInsertSchema(pollLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPollLog = z.infer<typeof insertPollLogSchema>;
export type PollLogRow = typeof pollLogTable.$inferSelect;
