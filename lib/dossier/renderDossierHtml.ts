/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER · COMPOSITION

   The one coded composition. The private HTML page injects the string this
   returns, and the PDF document wraps the very same string — so there is
   exactly one composition and no separately hand-written PDF document. Any
   change to the dossier's structure happens here, once, for both.

   WHY A STRING BUILDER AND NOT A REACT COMPONENT:
   the PDF is produced inside a Route Handler, which Next.js runs under the
   `react-server` condition. Under that condition every `react-dom/server`
   entry point resolves to a module whose only statement is
   `throw new Error('react-dom/server is not supported in React Server
   Components.')` — so renderToStaticMarkup cannot render a component to a
   string there, by design and at runtime, not merely at build time. The
   alternatives were to have Chromium fetch the authenticated page over the
   network (self-fetch plus session-cookie forwarding) or to post the browser's
   own DOM back to the server to be printed. Both add a production-risk
   surface to satisfy a document that has no interactivity at all. A pure
   function of the view model has neither, and makes the two outputs identical
   by construction rather than by convention.

   The dossier is a document, not a UI: no state, no props drilling, no
   events. Everything below is derived from the frozen canary seed via the
   view model — there is no user input anywhere in this file — but values are
   escaped on the way in regardless.
   ──────────────────────────────────────────────────────────────────────── */

import type {
  CollectorDossierViewModel,
  DossierPendingField,
} from "./collectorDossierViewModel";

const EVIDENCE_MODULE_ID = "SOURCES_EVIDENCE_PREPARATION";

export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function canaryMark(vm: CollectorDossierViewModel): string {
  return `<div class="fwt-dossier__canary">
      <span class="fwt-dossier__canary-primary">${esc(vm.canary.primary)}</span>
      <span class="fwt-dossier__canary-sep"></span>
      <span class="fwt-dossier__canary-secondary">${esc(
        vm.canary.secondary
      )}</span>
    </div>`;
}

function pendingRecord(
  title: string,
  fields: readonly DossierPendingField[]
): string {
  const rows = fields
    .map(
      (field) => `<div class="fwt-dossier__record-row">
        <span class="fwt-dossier__record-label">${esc(field.label)}</span>
        <span class="fwt-dossier__record-value">Not supplied</span>
      </div>`
    )
    .join("");

  return `<section class="fwt-dossier__record">
      <div class="fwt-dossier__record-title">${esc(title)}</div>
      ${rows}
    </section>`;
}

function section(
  vm: CollectorDossierViewModel,
  index: number,
  { moduleId, heading, paragraphs }: CollectorDossierViewModel["sections"][number]
): string {
  const isEvidence = moduleId === EVIDENCE_MODULE_ID;
  const firstClass = index === 0 ? " fwt-dossier__section--first" : "";

  const body = paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");

  /* The canonical/listing distinction is preserved in the view model. Rather
     than print a panel of empty brackets, the reader is told plainly that
     nothing listing-specific was supplied for this canary. */
  const listingTail =
    isEvidence && !vm.listingSpecific.supplied
      ? `<p class="fwt-dossier__note">${esc(
          vm.listingSpecific.readerNote
        )}</p>${pendingRecord(
          vm.preparationRecord.heading,
          vm.preparationRecord.fields
        )}`
      : "";

  return `<section class="fwt-dossier__section${firstClass}">
      <div class="fwt-dossier__section-head">
        <div class="fwt-dossier__hairline"></div>
        <h2 class="fwt-dossier__heading">${esc(heading)}</h2>
      </div>
      <div class="fwt-dossier__body">${body}</div>
      ${listingTail}
    </section>`;
}

export function renderDossierHtml(vm: CollectorDossierViewModel): string {
  const { identity } = vm;

  const sections = vm.sections
    .map((s, index) => section(vm, index, s))
    .join("");

  return `<article class="fwt-dossier">
  <div class="fwt-dossier__sheet">

    <header class="fwt-dossier__masthead">
      <div class="fwt-dossier__eyebrow">Collector Dossier</div>
      <h1 class="fwt-dossier__brand">${esc(identity.brand)}</h1>
      <div class="fwt-dossier__model">${esc(identity.collection)} ${esc(
    identity.model
  )}</div>

      <div class="fwt-dossier__rule"></div>

      <div class="fwt-dossier__identity-row">
        <div class="fwt-dossier__identity-cell">
          <div class="fwt-dossier__identity-label">Reference</div>
          <div class="fwt-dossier__identity-value">${esc(
            identity.reference
          )}</div>
        </div>
        <div class="fwt-dossier__identity-cell">
          <div class="fwt-dossier__identity-label">Case</div>
          <div class="fwt-dossier__identity-value fwt-dossier__identity-value--plain">${esc(
            identity.caseMaterial
          )}</div>
        </div>
      </div>

      <div class="fwt-dossier__canary-wrap">${canaryMark(vm)}</div>
    </header>

    <!-- Ornament in the house palette echoing the dial's geometry. Not a
         photograph, and not a depiction of the subject watch — no listing
         photography was supplied for this canary. -->
    <div class="fwt-dossier__damier" aria-hidden="true"></div>

    <p class="fwt-dossier__lead">${esc(vm.openingIdentity)}</p>

    ${sections}

    <footer class="fwt-dossier__colophon">
      ${canaryMark(vm)}
      <div class="fwt-dossier__colophon-line" style="margin-top:18px;">Editorial source</div>
      <div class="fwt-dossier__hash">manuscript ${esc(
        vm.canary.editorialManuscriptSha256
      )}</div>
      <div class="fwt-dossier__hash">delta ${esc(
        vm.canary.editorialDeltaSha256
      )}</div>
    </footer>

  </div>
</article>`;
}
