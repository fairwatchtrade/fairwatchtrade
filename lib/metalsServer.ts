import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import {
  METAL_KEYS,
  directionsFromSnapshots,
  emptyMetalDirections,
  fourHourReferenceWindow,
  type MetalDirections,
  type MetalKey,
  type MetalSnapshot,
  type SpotPrices,
} from "@/lib/metals";

const BASE = "https://api.gold-api.com/price";
const SYMBOLS: Record<MetalKey, string> = {
  gold: "XAU",
  silver: "XAG",
  platinum: "XPT",
};

async function priceOf(symbol: string): Promise<number | null> {
  const response = await fetch(`${BASE}/${symbol}`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`gold-api ${response.status}`);
  const json = await response.json();
  const price =
    typeof json?.price === "number" ? json.price : Number(json?.price);
  return Number.isFinite(price) && price > 0
    ? Math.round(price * 100) / 100
    : null;
}

export async function fetchSpotPrices(): Promise<SpotPrices> {
  const prices = await Promise.all(
    METAL_KEYS.map((metal) => priceOf(SYMBOLS[metal])),
  );
  return {
    gold: prices[0],
    silver: prices[1],
    platinum: prices[2],
  };
}

export async function readFourHourDirections(
  current: SpotPrices,
  asOf: Date,
): Promise<MetalDirections> {
  try {
    const db = createServiceClient();
    const { earliest, latest } = fourHourReferenceWindow(asOf);
    const { data, error } = await db
      .from("metal_price_snapshots")
      .select("metal, price, captured_at")
      .gte("captured_at", earliest.toISOString())
      .lte("captured_at", latest.toISOString());

    if (error) throw error;

    const snapshots = (data ?? [])
      .map((row) => ({
        metal: row.metal as MetalKey,
        price: Number(row.price),
        captured_at: row.captured_at as string,
      }))
      .filter(
        (row): row is MetalSnapshot =>
          METAL_KEYS.includes(row.metal) &&
          Number.isFinite(row.price) &&
          typeof row.captured_at === "string",
      );

    return directionsFromSnapshots(current, snapshots, asOf);
  } catch (error) {
    // Direction is optional context. A missing table, credential, or read can
    // never take the live spot prices down and can never fabricate movement.
    console.warn(
      "[metals] four-hour history unavailable; returning prices without direction",
      error,
    );
    return emptyMetalDirections();
  }
}

export function completeSpotPrices(
  prices: SpotPrices,
): prices is Record<MetalKey, number> {
  return METAL_KEYS.every((metal) => prices[metal] != null);
}
