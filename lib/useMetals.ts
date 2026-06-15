"use client";

import { useEffect, useState } from "react";

export type Metal = {
  key: string;
  label: string;
  price: number | null;
  changePct: number | null;
};

export type MetalsPayload = {
  asOf: string;
  source: string;
  metals: Metal[];
};

const TTL = 15 * 60 * 1000;

let cache: MetalsPayload | null = null;
let lastFetch = 0;
let inflight: Promise<MetalsPayload> | null = null;
const subscribers = new Set<(p: MetalsPayload) => void>();

async function load(): Promise<MetalsPayload> {
  const res = await fetch("/api/metals");
  if (!res.ok) throw new Error("metals fetch failed");
  const data = (await res.json()) as MetalsPayload;
  cache = data;
  lastFetch = Date.now();
  subscribers.forEach((s) => s(data));
  return data;
}

function ensureFresh(): Promise<MetalsPayload> {
  if (inflight) return inflight;
  if (cache && Date.now() - lastFetch < TTL) return Promise.resolve(cache);
  inflight = load().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function useMetals() {
  const [data, setData] = useState<MetalsPayload | null>(cache);

  useEffect(() => {
    const cb = (p: MetalsPayload) => setData(p);
    subscribers.add(cb);
    ensureFresh().then(setData).catch(() => {});
    const id = setInterval(() => {
      lastFetch = 0;
      ensureFresh().catch(() => {});
    }, TTL);
    return () => {
      subscribers.delete(cb);
      clearInterval(id);
    };
  }, []);

  return data;
}