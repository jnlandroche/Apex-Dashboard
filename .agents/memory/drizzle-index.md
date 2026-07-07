---
name: Drizzle ORM index syntax
description: Correct array-form index syntax for Drizzle 0.45+
---

# Drizzle 0.45+ index syntax

Use the **array form** (third argument to `pgTable`):

```ts
import { pgTable, index } from "drizzle-orm/pg-core";

export const myTable = pgTable("my_table", {
  ...columns
}, (table) => [
  index("my_idx").on(table.col1, table.col2)
]);
```

**Why:** Drizzle changed from object form `(table) => ({ ... })` to array form `(table) => [...]` in v0.30+. Object form still exists for some uses but causes type errors in some contexts.

**How to apply:** Any new table needing a composite index — use this exact pattern.
