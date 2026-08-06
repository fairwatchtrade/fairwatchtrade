/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — hashing

   SHA-256 over exact bytes via native Web Crypto. Works in the browser and
   under direct node execution (globalThis.crypto is the same API in both).
   No hashing dependency is added — the platform primitive is the authority.
   ──────────────────────────────────────────────────────────────────────── */

const textEncoder = new TextEncoder();

export function utf8Bytes(text: string): Uint8Array {
  return textEncoder.encode(text);
}

export function utf8Text(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function toHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += view[i].toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256HexOfBytes(
  bytes: ArrayBuffer | Uint8Array
): Promise<string> {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Copy into a plain ArrayBuffer so subtle.digest never sees a SharedArrayBuffer view.
  const copy = new Uint8Array(source.length);
  copy.set(source);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return toHex(digest);
}

export async function sha256HexOfText(text: string): Promise<string> {
  return sha256HexOfBytes(utf8Bytes(text));
}
