/* ════════════════════════════════════════════════════════════════════════
   PHOTO FORENSICS — capture metadata, read BEFORE the pipeline destroys it

   ── THE BUG THIS EXISTS TO FIX ─────────────────────────────────────────
   lib/storage.ts compresses every upload by redrawing it through a canvas,
   and canvas.toBlob() strips ALL metadata. So every photograph reaching
   FairWatchTrade arrived with no EXIF at all — including genuine phone
   photos, which carry a camera signature and a capture time.

   That is the single strongest "is this really your photograph" signal there
   is, and we were deleting it at the door, then treating its absence as
   meaningless because it was absent for everyone. A stolen photo and an
   honest one looked identical by the time we saw them.

   This module reads that metadata from the ORIGINAL file, before compression,
   so the signal survives.

   ── PRIVACY BY CONSTRUCTION, NOT BY FILTERING ──────────────────────────
   Phone photographs frequently carry GPS coordinates — a seller's home
   address. This parser DOES NOT READ THE GPS IFD. Not "reads and discards":
   it never walks that pointer at all, so there is no code path on which a
   location could be logged, stored, or leaked, and no future refactor can
   accidentally start keeping it.

   The allowlist below is the whole surface: camera make, camera model, lens,
   authoring software, and capture time. Nothing else is extracted.

   Server-side, sharp could read EXIF directly — but by then the browser has
   already destroyed it. It has to happen here.
   ════════════════════════════════════════════════════════════════════════ */

export type CaptureMetadata = {
  /** True when the original file carried an EXIF block at all. */
  hasExif: boolean;
  make: string | null;
  model: string | null;
  lens: string | null;
  /** Authoring software — "Adobe Photoshop", "GIMP" etc. Editing is not
      guilt, but it is worth a reviewer knowing. */
  software: string | null;
  /** DateTimeOriginal, as stored. Not normalized to UTC: the camera's own
      local wall-clock is the honest value and timezone is not recorded. */
  capturedAt: string | null;
  /** Dimensions of the ORIGINAL file, before our own resize. More
      diagnostic than the post-compression size, which we normalize. */
  originalWidth: number | null;
  originalHeight: number | null;
  /** Original byte length — a 40KB "photo" is not off a phone camera. */
  originalBytes: number | null;
  /** Original MIME type. A PNG in a set of JPEGs is a download, not a shot. */
  originalType: string | null;
};

export function emptyCaptureMetadata(): CaptureMetadata {
  return {
    hasExif: false,
    make: null,
    model: null,
    lens: null,
    software: null,
    capturedAt: null,
    originalWidth: null,
    originalHeight: null,
    originalBytes: null,
    originalType: null,
  };
}

/* TIFF tags we are willing to read. Deliberately tiny. GPSInfo (0x8825) is
   absent and must stay absent — see the privacy note above. */
const TAG_MAKE = 0x010f;
const TAG_MODEL = 0x0110;
const TAG_SOFTWARE = 0x0131;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_LENS_MODEL = 0xa434;

const MAX_STR = 128;

function clean(s: string | null): string | null {
  if (s === null) return null;
  const t = s.replace(/\0/g, "").trim();
  return t === "" ? null : t.slice(0, MAX_STR);
}

/* Minimal EXIF reader: JPEG APP1 → TIFF header → IFD0 → ExifIFD.
   Written by hand rather than pulled from a package because the security
   property we want is "this code cannot read location", and that is only
   true if we can see all of it. */
function parseExif(buf: ArrayBuffer): Partial<CaptureMetadata> | null {
  const view = new DataView(buf);
  if (view.byteLength < 4) return null;
  // JPEG SOI
  if (view.getUint16(0) !== 0xffd8) return null;

  // Walk segments for APP1/Exif
  let offset = 2;
  let tiffStart = -1;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda) break; // start of scan — no EXIF before pixels
    const size = view.getUint16(offset + 2);
    if (size < 2) break;
    if (marker === 0xe1 && offset + 10 <= view.byteLength) {
      // "Exif\0\0"
      if (
        view.getUint32(offset + 4) === 0x45786966 &&
        view.getUint16(offset + 8) === 0x0000
      ) {
        tiffStart = offset + 10;
        break;
      }
    }
    offset += 2 + size;
  }
  if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return null;

  const le = view.getUint16(tiffStart) === 0x4949; // "II" little-endian
  const u16 = (p: number) => view.getUint16(p, le);
  const u32 = (p: number) => view.getUint32(p, le);

  if (u16(tiffStart + 2) !== 42) return null;
  const ifd0 = tiffStart + u32(tiffStart + 4);
  if (ifd0 + 2 > view.byteLength) return null;

  const out: Partial<CaptureMetadata> = { hasExif: true };

  const readAscii = (valueOffset: number, count: number): string | null => {
    const start = tiffStart + valueOffset;
    if (start < 0 || start + count > view.byteLength) return null;
    let s = "";
    for (let i = 0; i < count; i++) s += String.fromCharCode(view.getUint8(start + i));
    return s;
  };

  const readEntry = (entry: number): { tag: number; ascii: string | null; long: number } => {
    const tag = u16(entry);
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    let ascii: string | null = null;
    let long = 0;
    if (type === 2 && count > 0 && count < 4096) {
      // ASCII: inline when it fits in 4 bytes, otherwise an offset
      ascii =
        count <= 4
          ? readAscii(entry + 8 - tiffStart, count)
          : readAscii(u32(entry + 8), count);
    } else if (type === 4 || type === 3) {
      long = type === 4 ? u32(entry + 8) : u16(entry + 8);
    }
    return { tag, ascii, long };
  };

  const walk = (ifd: number, depth: number) => {
    if (depth > 1 || ifd + 2 > view.byteLength) return;
    const count = u16(ifd);
    if (count > 512) return; // hostile or corrupt
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) return;
      const { tag, ascii, long } = readEntry(entry);
      switch (tag) {
        case TAG_MAKE:
          out.make = clean(ascii);
          break;
        case TAG_MODEL:
          out.model = clean(ascii);
          break;
        case TAG_SOFTWARE:
          out.software = clean(ascii);
          break;
        case TAG_LENS_MODEL:
          out.lens = clean(ascii);
          break;
        case TAG_DATETIME_ORIGINAL:
          out.capturedAt = clean(ascii);
          break;
        case TAG_EXIF_IFD:
          if (long > 0) walk(tiffStart + long, depth + 1);
          break;
        /* NOTE: 0x8825 (GPSInfo) is intentionally NOT handled. Do not add it. */
        default:
          break;
      }
    }
  };

  try {
    walk(ifd0, 0);
  } catch {
    return out; // partial metadata is still better than none
  }
  return out;
}

/* Read everything worth keeping from the file the seller actually chose.
   MUST be called before compressImage(). Never throws — a photograph that
   resists parsing is not an error, it just yields less signal. */
export async function readCaptureMetadata(file: File): Promise<CaptureMetadata> {
  const meta = emptyCaptureMetadata();
  meta.originalBytes = file.size;
  meta.originalType = file.type || null;

  try {
    const bitmap = await createImageBitmap(file);
    meta.originalWidth = bitmap.width;
    meta.originalHeight = bitmap.height;
    bitmap.close?.();
  } catch {
    /* undecodable — dimensions stay null */
  }

  if (/^image\/jpe?g$/.test(file.type)) {
    try {
      const parsed = parseExif(await file.arrayBuffer());
      if (parsed) Object.assign(meta, parsed);
    } catch {
      /* unreadable EXIF is not a failure */
    }
  }

  return meta;
}
