---
name: Apex API endpoint quirks
description: Correct mozambiquehe.re endpoint URLs and response structure gotchas
---

# Mozambiquehe.re API quirks

**Map rotation:** `GET /maprotation?auth={key}` — returns flat `{ current: {...}, next: {...} }`. NOT `/mapassets`.

**Server status:** `GET /servers?auth={key}` — returns top-level keys (EA_novafusion, selfCoreTest, etc.) each with `Status` and `ResponseTime`. Nested `otherPlatforms` object has no `ResponseTime`. Filter by `ResponseTime > 0`.

**Player profile:** `GET /bridge?auth={key}&player={name}&platform={PC|X1|PS4}` — response has `global.rank.rankScore`, `global.level`, `total.*` bag.

**K/D is unreliable:** often 0 in `total.kd.value`. Fix: scan all keys in `total` bag for plausible KD values (0–50 range), or compute from `total.kills / total.deaths`. tracker.gg supplements when both are 0.

**Why:** mozambiquehe.re's `total.kd` key is platform/account-dependent and frequently missing.
