import { pgTable, serial, text, integer, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const mvpRecordsTable = pgTable(
  "mvp_records",
  {
    id: serial("id").primaryKey(),
    periodLabel: text("period_label").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    playerName: text("player_name").notNull(),
    rpGained: integer("rp_gained").notNull().default(0),
    killsGained: integer("kills_gained").notNull().default(0),
    damageGained: integer("damage_gained").notNull().default(0),
    score: real("score").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mvp_records_computed_at_idx").on(table.computedAt),
  ],
);

export const insertMvpRecordSchema = createInsertSchema(mvpRecordsTable).omit({ id: true });
export type InsertMvpRecord = z.infer<typeof insertMvpRecordSchema>;
export type MvpRecord = typeof mvpRecordsTable.$inferSelect;
