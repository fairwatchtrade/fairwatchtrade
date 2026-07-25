/* ────────────────────────────────────────────────────────────────────────
   UUID — secure-context-safe v4 generator

   crypto.randomUUID() exists ONLY in secure contexts (https / localhost).
   FairWatchTrade's LAN dev loop — http://192.168.0.97:3900 on real devices —
   is an insecure origin, where it is undefined and the sell flow crashed to
   the error boundary (caught during List From Phone device verification;
   the defect predates that flight — v2.24's desktopIds initializer).

   crypto.getRandomValues IS available on insecure origins, so the fallback
   derives a spec-correct RFC 4122 v4 UUID from it. Same shape, same
   randomness source, works everywhere. Use this everywhere client code
   needs a UUID; never call crypto.randomUUID directly in components.
   ──────────────────────────────────────────────────────────────────────── */

export function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
