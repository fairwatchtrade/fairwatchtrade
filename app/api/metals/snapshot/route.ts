import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  completeSpotPrices,
  fetchSpotPrices,
} from "@/lib/metalsServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (token === "") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const { data: valid, error: authError } = await db.rpc(
    "metal_price_snapshot_token_valid",
    { p_token: token },
  );
  if (authError) {
    return NextResponse.json(
      { error: "snapshot_auth_unavailable" },
      { status: 503 },
    );
  }
  if (valid !== true) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const prices = await fetchSpotPrices();
    if (!completeSpotPrices(prices)) {
      return NextResponse.json(
        { error: "incomplete_provider_prices" },
        { status: 502 },
      );
    }

    const capturedAt = new Date().toISOString();
    const { data, error } = await db.rpc("record_metal_price_snapshot", {
      p_gold: prices.gold,
      p_silver: prices.silver,
      p_platinum: prices.platinum,
      p_captured_at: capturedAt,
    });
    if (error) {
      return NextResponse.json(
        { error: "snapshot_write_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, capturedAt, retention: data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "metals snapshot failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
