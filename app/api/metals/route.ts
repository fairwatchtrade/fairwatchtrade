import { NextResponse } from "next/server";

// gold-api.com: free, no key, no rate limits, CORS, prices already in USD/oz.
export const revalidate = 300;

const BASE = "https://api.gold-api.com/price";
const SYMBOLS = { gold: "XAU", silver: "XAG", platinum: "XPT" } as const;
type MetalKey = keyof typeof SYMBOLS;

async function priceOf(symbol: string): Promise<number | null> {
  const res = await fetch(`${BASE}/${symbol}`, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`gold-api ${res.status}`);
  const json = await res.json();
  const p = typeof json?.price === "number" ? json.price : Number(json?.price);
  return Number.isFinite(p) && p > 0 ? p : null;
}

export async function GET() {
  try {
    const keys = Object.keys(SYMBOLS) as MetalKey[];
    const prices = await Promise.all(keys.map((k) => priceOf(SYMBOLS[k])));
    const metals = keys.map((k, i) => ({
      key: k,
      label: k[0].toUpperCase() + k.slice(1),
      price: prices[i] == null ? null : Math.round(prices[i]! * 100) / 100,
      changePct: null as number | null,
    }));
    return NextResponse.json(
      { asOf: new Date().toISOString(), source: "London spot", metals },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "metals fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}