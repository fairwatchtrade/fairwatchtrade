/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER · SHARED CONTENT / VIEW MODEL

   ONE view model. The private HTML page and the PDF both read from this and
   nothing else — same identity, same section order, same headings, same
   approved prose, same evidence labels, same uncertainty language, same
   canary marks. There is no separately handwritten PDF document.

   PROSE LAW: every string in `paragraphs` below is transcribed verbatim from
   section B of the hash-bound v3 editorial manuscript
   (sha256 6897c3d6…9b130). Do not rewrite, tighten, merge, or "improve" this
   copy in code. The attributions ("Sotheby's identifies…", "Qualified auction
   records place…") and the uncertainty language ("should be checked on the
   subject watch", "not a determination that…") are load-bearing: the
   editorial pass preserved nine attributed content units and thirty-five
   recheck conditions, and dropping a clause here would silently break that.

   The paragraph-lineage ledger (manuscript section C) is hidden support
   material. It is deliberately NOT modelled here, because nothing in this
   file may render as reader-facing prose that isn't approved reader copy.

   CANONICAL vs LISTING: the canonical reference truth and the listing-specific
   material stay separated. `listingSpecific.supplied` is false for this canary
   and the fields carry no invented values.
   ──────────────────────────────────────────────────────────────────────── */

import {
  BREGUET_5967_CANARY_SEED,
  CANARY_MARK_PRIMARY,
  CANARY_MARK_SECONDARY,
  type Breguet5967CanarySeed,
} from "./breguet5967CanarySeed";

export type DossierSection = {
  /** Editorial module id — kept for traceability, never rendered. */
  readonly moduleId: string;
  readonly heading: string;
  readonly paragraphs: readonly string[];
};

export type DossierPendingField = {
  readonly label: string;
  /** Never fabricated. Null means the governed record does not supply it. */
  readonly value: string | null;
};

export type CollectorDossierViewModel = {
  readonly identity: {
    readonly brand: string;
    readonly collection: string;
    readonly model: string;
    readonly reference: string;
    readonly secondaryLabel: string;
    readonly secondaryValue: string;
  };
  /** The opening identity line — manuscript "Exact Identity". */
  readonly openingIdentity: string;
  /** Reader-facing sections, in the required visible reading order. */
  readonly sections: readonly DossierSection[];
  /** Governs the stored artifact path (collector-dossier-v{n}.pdf): 1 for
      the Vault-only skeleton, 2 when a founder-approved reference-level
      article supplies the editorial body. */
  readonly templateVersion: number;
  /** Canonical/listing distinction, preserved but not rendered as a section. */
  readonly listingSpecific: {
    readonly moduleId: string;
    readonly heading: string;
    readonly supplied: boolean;
    readonly readerNote: string;
    readonly intent: string;
    readonly fields: readonly DossierPendingField[];
  };
  readonly preparationRecord: {
    readonly heading: string;
    readonly fields: readonly DossierPendingField[];
  };
  readonly canary: {
    readonly primary: string;
    readonly secondary: string;
    readonly state: Breguet5967CanarySeed["canaryState"] | "reference_production";
    readonly authorizedToServe: boolean;
    readonly editorialManuscriptSha256: string | null;
    readonly editorialDeltaSha256: string | null;
  };
};

const NOT_SUPPLIED = (label: string): DossierPendingField => ({
  label,
  value: null,
});

/* The one bounded Breguet canary view model. */
export function buildBreguet5967CanaryViewModel(): CollectorDossierViewModel {
  const seed = BREGUET_5967_CANARY_SEED;

  return {
    templateVersion: 1,
    identity: {
      brand: seed.brand,
      collection: seed.collection,
      model: seed.model,
      reference: seed.reference,
      secondaryLabel: "Case",
      secondaryValue: seed.caseMaterial,
    },

    openingIdentity:
      "Reference 5967BB/11/9W6 is the documented 18K white-gold configuration of the Breguet Classique 5967.",

    sections: [
      {
        moduleId: "AT_A_GLANCE",
        heading: "At a Glance",
        paragraphs: [
          "Its case measures 41 mm in diameter. Specialist records report a thickness of 6.95 mm, while some exact-reference dealer archives round the figure to 7 mm.",
          "When new, the model was specified for 30 metres (3 bar) of water resistance. That wording describes the original model specification, not the present condition of an individual watch.",
          "Sapphire frames both views: a sapphire crystal over the dial and a sapphire exhibition back over the movement.",
        ],
      },
      {
        moduleId: "WHY_REFERENCE_MATTERS",
        heading: "Why This Reference Matters",
        paragraphs: [
          "The two-hand layout leaves a broad, largely uninterrupted field for the Damier Art Déco guilloché. Across it, the geometry can read as a pattern of three-dimensional cubes, with much of the watch’s visual depth coming from the surface itself rather than from additional indications.",
          "Sotheby’s identifies reference 5967 as Breguet’s first use of the Damier Art Déco guilloché. The watch places familiar Breguet case, hand and numeral vocabulary against a distinctly geometric dial treatment.",
        ],
      },
      {
        moduleId: "DAMIER_ART_DECO_DIAL",
        heading: "The Damier Art Déco Dial",
        paragraphs: [
          "The 18K gold dial has a silvered finish and is hand-guilloché. Contemporary technical reporting names the motif “Damier Art Déco.”",
          "Over that patterned gold field, blued steel open-tipped Breguet hands indicate the hours and minutes against a Roman-numeral chapter ring. Together, the Roman chapter and blued hands form a distinct reading layer above the geometry.",
          "The dial is individually numbered, although the number’s exact placement should be checked on the subject watch. Qualified auction records place the two secret signatures between XI–XII and XII–I.",
        ],
      },
      {
        moduleId: "MOVEMENT_AND_THINNESS",
        heading: "Movement and Thinness",
        paragraphs: [
          "The movement is the manually wound Breguet calibre 506.2.",
          "It measures 15¾ lignes, approximately 35.5 mm by standard conversion.",
          "The calibre has 20 jewels, runs at 3 Hz, offers approximately 40 hours of power reserve and was specified as adjusted in five positions.",
          "Through the sapphire back, the signed and numbered movement is presented with Geneva-striped bridges.",
          "From the back, the large movement occupies a broad portion of the display view.",
          "Sotheby’s and specialist horological sources identify calibre 506.2 with Frédéric Piguet 151 architecture, describing it as a large Lépine/pocket-watch calibre.",
          "Qualified auction catalogues describe the 5967’s sapphire exhibition back as snap-on.",
        ],
      },
      {
        moduleId: "HOW_REFERENCE_DIFFERS",
        heading: "White Gold and Yellow Gold",
        paragraphs: [
          "A documented 18K yellow-gold sibling is reference 5967BA/11/9W6.",
          "Exact-reference auction records and full-set dealer records document 5967BB/11/9W6 with a black Breguet alligator strap and an 18K white-gold pin buckle. That is a documented configuration, not a determination that the strap or buckle on an individual watch is original.",
        ],
      },
      {
        moduleId: "BREGUET_CRAFT_TRADITIONS",
        heading: "Relevant Breguet Craft Traditions",
        paragraphs: [
          "Two visible details connect the 5967 with established Breguet craft traditions. Breguet dates its adoption of guilloché in watchmaking to 1786, while the modern manufacture continues hand engine-turning on traditional lathes; the 5967’s blued open-tipped hands continue a form the house traces to about 1783.",
          "Secret signatures and individual numbers are also established elements of Breguet’s identification vocabulary. Those identifiers are not, by themselves, a complete authenticity determination.",
        ],
      },
      {
        moduleId: "CURRENT_HISTORICAL_BOUNDARY",
        heading: "Historical Boundary",
        paragraphs: [
          "Breguet introduced the Classique 5967 in 2009. My-WatchSite marks the model as no longer commercialized, and the 5967 is absent from Breguet’s current Classique product collection.",
        ],
      },
      {
        moduleId: "SOURCES_EVIDENCE_PREPARATION",
        heading: "Evidence and Preparation",
        paragraphs: [
          "No numbered-edition statement was located in the contemporary technical material or qualified records reviewed for this dossier. This does not establish that no special configuration ever existed.",
        ],
      },
    ],

    /* Preserved in the view model; not rendered as a reader-facing section,
       because no listing supplies it for this canary and an empty panel of
       bracketed placeholders is not honest reader copy. The one-line reader
       note below is what the reader sees instead, inside Evidence and
       Preparation. */
    listingSpecific: {
      moduleId: "LISTING_SPECIFIC_WATCH",
      heading: "The Listing-Specific Watch",
      supplied: false,
      readerNote: "Listing-specific details not supplied for this canary.",
      intent:
        "The details below belong to the individual watch being offered and must be supplied from its listing.",
      fields: [
        NOT_SUPPLIED("Condition"),
        NOT_SUPPLIED("Included items"),
        NOT_SUPPLIED("Service information"),
        NOT_SUPPLIED("Seller-provided provenance"),
        NOT_SUPPLIED("Listing photographs"),
        NOT_SUPPLIED("Current asking price"),
        NOT_SUPPLIED("Listing captured date"),
      ],
    },

    preparationRecord: {
      heading: "Preparation record",
      fields: [
        NOT_SUPPLIED("Prepared date"),
        NOT_SUPPLIED("Vault revision"),
        NOT_SUPPLIED("Evidence record revision"),
        NOT_SUPPLIED("Dossier template version"),
        NOT_SUPPLIED("Listing revision"),
      ],
    },

    canary: {
      primary: CANARY_MARK_PRIMARY,
      secondary: CANARY_MARK_SECONDARY,
      state: seed.canaryState,
      authorizedToServe: seed.authorizedToServe,
      editorialManuscriptSha256: seed.editorialManuscriptSha256,
      editorialDeltaSha256: seed.editorialDeltaSha256,
    },
  };
}
