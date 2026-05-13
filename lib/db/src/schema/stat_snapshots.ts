import { pgTable, serial, integer, text, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

export const statSnapshotsTable = pgTable("stat_snapshots", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  rankName: text("rank_name"),
  rankScore: integer("rank_score"),
  level: integer("level"),
  kills: integer("kills"),
  damage: integer("damage"),
  kd: real("kd"),
});

export const insertStatSnapshotSchema = createInsertSchema(statSnapshotsTable).omit({
  id: true,
});
export type InsertStatSnapshot = z.infer<typeof insertStatSnapshotSchema>;
export type StatSnapshot = typeof statSnapshotsTable.$inferSelect;
