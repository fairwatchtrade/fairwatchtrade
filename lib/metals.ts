export const METAL_KEYS = ["gold", "silver", "platinum"] as const;

export type MetalKey = (typeof METAL_KEYS)[number];
export type MetalDirection = "up" | "down" | null;

export type MetalSnapshot = {
  metal: MetalKey;
  price: number;
  captured_at: string;
};

export type SpotPrices = Record<MetalKey, number | null>;
export type MetalDirections = Record<MetalKey, MetalDirection>;

export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
export const REFERENCE_TOLERANCE_MS = 45 * 60 * 1000;

// One basis point filters provider-level dust without suppressing a real move.
const EFFECTIVELY_UNCHANGED_RATIO = 0.0001;

export const METAL_DOT_CLASS: Record<MetalKey, string> = {
  gold: "bg-[#C98A16]",
  silver: "bg-[#9EA3AA]",
  platinum: "bg-[#DDD8CC] ring-1 ring-inset ring-[#9A9487]/60",
};

export function emptyMetalDirections(): MetalDirections {
  return { gold: null, silver: null, platinum: null };
}

export function directionFromPrices(
  current: number | null,
  reference: number | null,
): MetalDirection {
  if (
    current == null ||
    reference == null ||
    !Number.isFinite(current) ||
    !Number.isFinite(reference) ||
    current <= 0 ||
    reference <= 0
  ) {
    return null;
  }

  if (
    Math.abs(current - reference) / reference <=
    EFFECTIVELY_UNCHANGED_RATIO
  ) {
    return null;
  }

  return current > reference ? "up" : "down";
}

export function fourHourReferenceWindow(asOf: Date) {
  const targetMs = asOf.getTime() - FOUR_HOURS_MS;
  return {
    target: new Date(targetMs),
    earliest: new Date(targetMs - REFERENCE_TOLERANCE_MS),
    latest: new Date(targetMs + REFERENCE_TOLERANCE_MS),
  };
}

export function directionsFromSnapshots(
  current: SpotPrices,
  snapshots: MetalSnapshot[],
  asOf: Date,
): MetalDirections {
  const { target } = fourHourReferenceWindow(asOf);
  const targetMs = target.getTime();
  const directions = emptyMetalDirections();

  for (const metal of METAL_KEYS) {
    let nearest: { price: number; at: number; distance: number } | null = null;

    for (const snapshot of snapshots) {
      if (snapshot.metal !== metal) continue;
      const at = Date.parse(snapshot.captured_at);
      if (!Number.isFinite(at) || !Number.isFinite(snapshot.price)) continue;
      const distance = Math.abs(at - targetMs);
      if (distance > REFERENCE_TOLERANCE_MS) continue;

      // A tie chooses the earlier observation: it never makes a younger move
      // masquerade as the requested approximately-four-hour comparison.
      if (
        nearest == null ||
        distance < nearest.distance ||
        (distance === nearest.distance && at < nearest.at)
      ) {
        nearest = { price: snapshot.price, at, distance };
      }
    }

    directions[metal] = directionFromPrices(
      current[metal],
      nearest?.price ?? null,
    );
  }

  return directions;
}
