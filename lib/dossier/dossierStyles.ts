/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER · COMPOSITION STYLESHEET

   Deliberately self-contained and Tailwind-free, scoped under `.fwt-dossier`.

   WHY NOT TAILWIND: the PDF is produced by rendering the very same React
   composition to a static HTML string and handing it to Chromium via
   setContent — there is no Next.js document, no compiled Tailwind sheet and
   no globals.css in that context. Utility classes would silently render
   unstyled in the PDF while looking correct in the browser, which is exactly
   the HTML/PDF divergence this flight is required to avoid. Everything the
   composition needs therefore lives in this one string, including a local
   redeclaration of the house tokens.

   Token values are copied from app/globals.css. Keep them in step by hand;
   they are duplicated on purpose, not by accident.
   ──────────────────────────────────────────────────────────────────────── */

export const DOSSIER_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Inter:wght@300;400;500&display=swap";

export const dossierCss = `
.fwt-dossier {
  /* House tokens, scoped locally so the PDF document needs nothing else. */
  --d-ink:          #0D0F14;
  --d-ink-deep:     #07080C;
  --d-surface:      #13151C;
  --d-platinum:     #E8E4DC;
  --d-platinum-dim: #CFCBC3;
  --d-slate:        #9CA1B0;
  --d-muted:        #818799;
  --d-ghost:        #646B7A;
  --d-gold:         #C9A84C;
  --d-gold-dim:     #9A7E3A;
  --d-gold-subtle:  rgba(201,168,76,0.45);
  --d-gold-whisper: rgba(201,168,76,0.08);
  --d-border-gold:  rgba(201,168,76,0.28);
  --d-border-gold-strong: rgba(201,168,76,0.55);
  --d-border-subtle: rgba(255,255,255,0.06);

  --d-serif: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
  --d-sans:  'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  background: var(--d-ink);
  color: var(--d-platinum);
  font-family: var(--d-sans);
  font-weight: 300;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.fwt-dossier *, .fwt-dossier *::before, .fwt-dossier *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.fwt-dossier__sheet {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 32px 96px;
}

/* ── MASTHEAD ─────────────────────────────────────────────────────────── */

.fwt-dossier__masthead {
  padding: 88px 0 0;
  text-align: center;
  break-inside: avoid;
}

.fwt-dossier__eyebrow {
  font-family: var(--d-sans);
  font-size: 8px;
  font-weight: 400;
  letter-spacing: 4px;
  text-transform: uppercase;
  color: var(--d-gold-subtle);
}

.fwt-dossier__brand {
  font-family: var(--d-serif);
  font-size: 68px;
  font-weight: 300;
  line-height: 1.04;
  letter-spacing: 1px;
  color: var(--d-platinum);
  margin-top: 26px;
}

.fwt-dossier__model {
  font-family: var(--d-serif);
  font-size: 25px;
  font-weight: 300;
  font-style: italic;
  color: var(--d-platinum-dim);
  margin-top: 8px;
}

.fwt-dossier__rule {
  width: 36px;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--d-gold), transparent);
  margin: 30px auto;
  opacity: 0.6;
}

.fwt-dossier__identity-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px 30px;
  margin-top: 4px;
}

.fwt-dossier__identity-cell {
  text-align: center;
}

.fwt-dossier__identity-label {
  font-size: 7.5px;
  letter-spacing: 2.6px;
  text-transform: uppercase;
  color: var(--d-ghost);
}

.fwt-dossier__identity-value {
  font-family: var(--d-sans);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 1.4px;
  color: var(--d-gold);
  margin-top: 6px;
}

.fwt-dossier__identity-value--plain {
  color: var(--d-platinum-dim);
  letter-spacing: 0.6px;
}

/* ── DECORATIVE DAMIER BAND ───────────────────────────────────────────────
   A geometric motif in the house palette, echoing the dial's cube geometry.
   It is ornament, not documentation: no photograph of the subject watch was
   supplied for this canary, and none is implied here. Marked aria-hidden.
   ────────────────────────────────────────────────────────────────────── */

.fwt-dossier__damier {
  height: 108px;
  margin: 44px 0 8px;
  border-top: 1px solid var(--d-border-gold);
  border-bottom: 1px solid var(--d-border-gold);
  background-color: var(--d-ink-deep);
  background-image:
    linear-gradient(30deg,  rgba(201,168,76,0.10) 12%, transparent 12.5%, transparent 87%, rgba(201,168,76,0.10) 87.5%),
    linear-gradient(150deg, rgba(201,168,76,0.10) 12%, transparent 12.5%, transparent 87%, rgba(201,168,76,0.10) 87.5%),
    linear-gradient(30deg,  rgba(201,168,76,0.10) 12%, transparent 12.5%, transparent 87%, rgba(201,168,76,0.10) 87.5%),
    linear-gradient(150deg, rgba(201,168,76,0.10) 12%, transparent 12.5%, transparent 87%, rgba(201,168,76,0.10) 87.5%),
    linear-gradient(60deg,  rgba(232,228,220,0.035) 25%, transparent 25.5%, transparent 75%, rgba(232,228,220,0.035) 75%);
  background-size: 34px 60px;
  background-position: 0 0, 0 0, 17px 30px, 17px 30px, 0 0;
  break-inside: avoid;
}

/* ── LEAD / STANDFIRST ────────────────────────────────────────────────── */

.fwt-dossier__lead {
  font-family: var(--d-serif);
  font-size: 22px;
  font-weight: 300;
  font-style: italic;
  line-height: 1.72;
  color: var(--d-platinum-dim);
  text-align: center;
  padding: 40px 18px 4px;
  break-inside: avoid;
}

/* ── SECTIONS ─────────────────────────────────────────────────────────── */

.fwt-dossier__section {
  margin-top: 58px;
  /* Never strand a heading at the foot of a printed page. */
  break-inside: auto;
}

.fwt-dossier__section-head {
  break-after: avoid;
  break-inside: avoid;
  margin-bottom: 26px;
}

.fwt-dossier__hairline {
  height: 1px;
  background: linear-gradient(to right, var(--d-border-gold-strong), transparent);
  margin-bottom: 18px;
}

.fwt-dossier__heading {
  font-family: var(--d-serif);
  font-size: 30px;
  font-weight: 300;
  line-height: 1.25;
  color: var(--d-platinum);
  letter-spacing: 0.3px;
}

.fwt-dossier__body p {
  font-family: var(--d-sans);
  font-size: 14.5px;
  font-weight: 300;
  line-height: 1.95;
  color: var(--d-platinum-dim);
  margin-bottom: 22px;
  orphans: 3;
  widows: 3;
}

.fwt-dossier__body p:last-child { margin-bottom: 0; }

/* The first section's opening paragraph carries a little more presence. */
.fwt-dossier__section--first .fwt-dossier__body p:first-child {
  color: var(--d-platinum);
}

/* ── EVIDENCE / PREPARATION ───────────────────────────────────────────── */

.fwt-dossier__note {
  font-family: var(--d-sans);
  font-size: 12.5px;
  font-weight: 300;
  line-height: 1.85;
  color: var(--d-muted);
  border-left: 1px solid var(--d-border-gold);
  padding-left: 18px;
  margin-top: 26px;
  break-inside: avoid;
}

.fwt-dossier__record {
  margin-top: 34px;
  border: 1px solid var(--d-border-subtle);
  background: var(--d-surface);
  padding: 26px 28px;
  break-inside: avoid;
}

.fwt-dossier__record-title {
  font-size: 8px;
  letter-spacing: 3.2px;
  text-transform: uppercase;
  color: var(--d-gold-subtle);
  margin-bottom: 18px;
}

.fwt-dossier__record-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 20px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.035);
}

.fwt-dossier__record-row:last-child { border-bottom: 0; }

.fwt-dossier__record-label {
  font-size: 12px;
  font-weight: 300;
  color: var(--d-slate);
}

.fwt-dossier__record-value {
  font-size: 10.5px;
  letter-spacing: 0.8px;
  color: var(--d-ghost);
  text-align: right;
  white-space: nowrap;
}

/* ── COLOPHON ─────────────────────────────────────────────────────────── */

.fwt-dossier__colophon {
  margin-top: 64px;
  padding-top: 26px;
  border-top: 1px solid var(--d-border-subtle);
  text-align: center;
  break-inside: avoid;
}

/* ── CANARY MARK ──────────────────────────────────────────────────────────
   Subordinate to the watch in weight, unmistakable in meaning. In the browser
   this sits under the masthead and again at the foot. In the PDF the same two
   lines are additionally repeated on every page by the header/footer bands.
   ────────────────────────────────────────────────────────────────────── */

.fwt-dossier__canary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--d-border-gold);
  background: var(--d-gold-whisper);
  padding: 7px 14px;
  break-inside: avoid;
}

.fwt-dossier__canary-primary {
  font-size: 8px;
  font-weight: 500;
  letter-spacing: 2.6px;
  text-transform: uppercase;
  color: var(--d-gold);
}

.fwt-dossier__canary-sep {
  width: 1px;
  height: 10px;
  background: var(--d-border-gold-strong);
}

.fwt-dossier__canary-secondary {
  font-size: 8px;
  font-weight: 400;
  letter-spacing: 2.6px;
  text-transform: uppercase;
  color: var(--d-muted);
}

.fwt-dossier__canary-wrap {
  text-align: center;
  margin-top: 30px;
}
`;

/* ── PRINT-ONLY ADDITIONS ────────────────────────────────────────────────
   Applied only in the PDF document. The composition and its stylesheet above
   are unchanged; this adjusts page geometry, not content.
   ────────────────────────────────────────────────────────────────────── */

export const dossierPrintCss = `
html, body {
  background: #0D0F14;
  margin: 0;
  padding: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* NO @page margin rule here on purpose. Puppeteer reserves the top and bottom
   bands for the repeated canary marks via its own margin option; declaring
   an @page margin of 0 overrides that reservation in CSS while Chromium still
   paints the bands, so every heading after a page break collided with the
   header. Let the print settings own the page box. */

.fwt-dossier {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* Puppeteer reserves the top/bottom bands for the repeated canary marks;
   these paddings keep body copy clear of them on every page. */
.fwt-dossier__sheet {
  max-width: none;
  padding: 0 22mm 0;
}

.fwt-dossier__masthead { padding-top: 18mm; }

/* The browser-only canary chips are redundant in the PDF, where the marks are
   repeated on every page by the header and footer bands. */
.fwt-dossier__canary-wrap { display: none; }

.fwt-dossier__brand   { font-size: 58px; }
.fwt-dossier__lead    { font-size: 19px; }
.fwt-dossier__heading { font-size: 26px; }
.fwt-dossier__body p  { font-size: 12.5px; line-height: 1.85; }

/* A page break before the first section keeps the cover intact as an opening
   page and prevents a heading orphaning against the masthead. The padding
   (not a margin — margins collapse away across a forced break) keeps the
   first heading clear of the repeated header band. */
.fwt-dossier__section--first { break-before: page; margin-top: 0; padding-top: 5mm; }
.fwt-dossier__section        { break-inside: auto; }
.fwt-dossier__colophon       { break-inside: avoid; }
`;
