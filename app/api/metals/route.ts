import { NextResponse } from "next/server";
import { METAL_KEYS } from "@/lib/metals";
import {
  fetchSpotPrices,
  readFourHourDirections,
} from "@/lib/metalsServer";

// gold-api.com: free, no key, no rate limits, CORS, prices already in USD/oz.
export const revalidate = 300;

export async function GET() {
  try {
    const asOf = new Date();
    const prices = await fetchSpotPrices();
    const directions = await readFourHourDirections(prices, asOf);
    const metals = METAL_KEYS.map((key) => ({
      key,
      label: key[0].toUpperCase() + key.slice(1),
      price: prices[key],
      direction: directions[key],
    }));
    return NextResponse.json(
      { asOf: asOf.toISOString(), source: "London spot", metals },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "metals fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
