import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  directionFromPrices,
  directionsFromSnapshots,
  fourHourReferenceWindow,
} from "../lib/metals.ts";

const asOf = new Date("2026-08-19T12:30:00.000Z");

assert.equal(directionFromPrices(101, 100), "up");
assert.equal(directionFromPrices(99, 100), "down");
assert.equal(directionFromPrices(100.005, 100), null);
assert.equal(directionFromPrices(null, 100), null);
assert.equal(directionFromPrices(100, null), null);

const directions = directionsFromSnapshots(
  { gold: 110, silver: 49, platinum: 1000.05 },
  [
    // Both gold observations are 30 minutes from the target. The older one
    // wins the tie, so the comparison cannot silently become younger than 4h.
    { metal: "gold", price: 100, captured_at: "2026-08-19T08:00:00.000Z" },
    { metal: "gold", price: 120, captured_at: "2026-08-19T09:00:00.000Z" },
    { metal: "silver", price: 50, captured_at: "2026-08-19T08:00:00.000Z" },
    {
      metal: "platinum",
      price: 1000,
      captured_at: "2026-08-19T08:00:00.000Z",
    },
  ],
  asOf,
);
assert.deepEqual(directions, { gold: "up", silver: "down", platinum: null });

assert.deepEqual(
  directionsFromSnapshots(
    { gold: 110, silver: 49, platinum: 900 },
    [
      // 2.5 hours old is outside the approximately-four-hour reference band.
      { metal: "gold", price: 100, captured_at: "2026-08-19T10:00:00.000Z" },
    ],
    asOf,
  ),
  { gold: null, silver: null, platinum: null },
);

const window = fourHourReferenceWindow(asOf);
assert.equal(window.target.toISOString(), "2026-08-19T08:30:00.000Z");
assert.equal(window.earliest.toISOString(), "2026-08-19T07:45:00.000Z");
assert.equal(window.latest.toISOString(), "2026-08-19T09:15:00.000Z");

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260819090000_metals_four_hour_direction.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /on conflict \(metal, snapshot_hour\) do update/i);
assert.match(
  migration,
  /snapshot_hour < v_hour - interval '24 hours'/i,
);
assert.match(migration, /'3 \* \* \* \*'/);
assert.match(migration, /metal-price-hourly-snapshot/);
assert.match(migration, /revoke all on public\.metal_price_snapshots/i);

const marketBar = readFileSync(
  new URL("../components/MarketBar.tsx", import.meta.url),
  "utf8",
);
assert.doesNotMatch(marketBar, /changePct/);
assert.doesNotMatch(marketBar, /toFixed\(/);
assert.match(marketBar, /Up.*over 4 hours/s);
assert.match(marketBar, /Down.*over 4 hours/s);

const metalsCore = readFileSync(
  new URL("../lib/metals.ts", import.meta.url),
  "utf8",
);
assert.doesNotMatch(metalsCore, /sky-/);
assert.match(metalsCore, /platinum: "bg-\[#DDD8CC\]/);

console.log("metals direction tests: passed");
