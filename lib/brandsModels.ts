/* ────────────────────────────────────────────────────────────────────────
   BRANDS & MODELS — reference data for model-field autofill.

   Generated from fairwatchtrade_brands_models_merged_v2.json (319 brands,
   915 models). Brands with an empty `models` array (80 of them) fall back to
   free-text model entry in ModelCombobox. Match brand by `name` (normalized).
   ──────────────────────────────────────────────────────────────────────── */

export type WatchModel = {
  display_name: string;
  search_aliases: string[];
};

export type BrandModels = {
  id: string;
  name: string;
  founding_snippet: string | null;
  models: WatchModel[];
};

export const BRANDS_MODELS: BrandModels[] = [
  {
    "id": "brand_001",
    "name": "Akin",
    "founding_snippet": "A highly exclusive, contemporary independent watchmaker known for producing ultra-low volume, bespoke timepieces with a heavy focus on architectural dial design and modern minimalism.",
    "models": [
      {
        "display_name": "Series 1",
        "search_aliases": [
          "series one",
          "minimalist"
        ]
      }
    ]
  },
  {
    "id": "brand_002",
    "name": "Akrivia",
    "founding_snippet": "Founded in Geneva in 2012 by master watchmaker Rexhep Rexhepi. The manufacture has achieved legendary status by combining hyper-traditional, flawless hand-finishing techniques with innovative, contemporary movement architecture.",
    "models": [
      {
        "display_name": "Chronomètre Contemporain I",
        "search_aliases": [
          "rrcc01",
          "rrcc1",
          "rexhep rexhepi"
        ]
      },
      {
        "display_name": "Chronomètre Contemporain II",
        "search_aliases": [
          "rrcc02",
          "rrcc2",
          "deadbeat"
        ]
      },
      {
        "display_name": "AK-01",
        "search_aliases": [
          "ak01",
          "tourbillon monopusher chronograph"
        ]
      },
      {
        "display_name": "AK-02",
        "search_aliases": [
          "ak02",
          "hour striker tourbillon"
        ]
      },
      {
        "display_name": "AK-03",
        "search_aliases": [
          "ak03",
          "chiming jump hour tourbillon"
        ]
      },
      {
        "display_name": "AK-04",
        "search_aliases": [
          "ak04",
          "regulator tourbillon"
        ]
      },
      {
        "display_name": "AK-05",
        "search_aliases": [
          "ak05",
          "barrette miroir tourbillon"
        ]
      },
      {
        "display_name": "AK-06",
        "search_aliases": [
          "ak06",
          "manual wind power reserve"
        ]
      }
    ]
  },
  {
    "id": "brand_003",
    "name": "Alexander Shorokhoff",
    "founding_snippet": "Established in Germany in 2002 by designer Alexander Shorokhov. The brand is famous for its 'Art on the Wrist' philosophy, utilizing vibrant colors, massive avant-garde typography, and highly intricate, completely hand-engraved movements.",
    "models": [
      {
        "display_name": "Avantgarde",
        "search_aliases": [
          "miss avantgarde",
          "babylon",
          "crossing",
          "kandy",
          "levels",
          "new planet",
          "unique"
        ]
      },
      {
        "display_name": "Heritage",
        "search_aliases": [
          "fedor dostoevsky",
          "leo tolstoy",
          "peter tchaikovsky",
          "alexander pushkin"
        ]
      },
      {
        "display_name": "Vintage",
        "search_aliases": [
          "hand-engraved",
          "historical movements"
        ]
      },
      {
        "display_name": "Tomorrow",
        "search_aliases": [
          "chronograph",
          "tourbillon"
        ]
      }
    ]
  },
  {
    "id": "brand_004",
    "name": "Alpina",
    "founding_snippet": "Founded in 1883 by Gottlieb Hauser in Winterthur, Switzerland. Alpina pioneered the modern Swiss sports watch blueprint in 1938 with the 'Alpina 4' concept, establishing strict parameters for anti-magnetism, shock resistance, water resistance, and stainless steel construction.",
    "models": [
      {
        "display_name": "Alpiner",
        "search_aliases": [
          "alpiner 4",
          "alpiner extreme",
          "heritage carree",
          "regulator"
        ]
      },
      {
        "display_name": "Startimer",
        "search_aliases": [
          "pilot automatic",
          "pilot heritage",
          "pilot quartz",
          "worldtimer"
        ]
      },
      {
        "display_name": "Seastrong",
        "search_aliases": [
          "diver 300",
          "diver heritage",
          "extreme diver"
        ]
      },
      {
        "display_name": "Complications",
        "search_aliases": [
          "flyback chronograph",
          "manufacture tourbillon"
        ]
      }
    ]
  },
  {
    "id": "brand_005",
    "name": "Angelus",
    "founding_snippet": "Tracing its historical roots back to 1891 in Le Locle, Switzerland, Angelus was historically famous for multi-complication travel clocks and chronographs like the Chronodato. The brand was structurally revived as a high-end, haute horlogerie manufacture focusing on architectural sapphire cases, skeletonized tourbillons, and flying instruments.",
    "models": [
      {
        "display_name": "Chronodato",
        "search_aliases": [
          "heritage collection",
          "chronograph"
        ]
      },
      {
        "display_name": "U20",
        "search_aliases": [
          "ultra skeleton tourbillon",
          "u-20"
        ]
      },
      {
        "display_name": "U30",
        "search_aliases": [
          "tourbillon rattrapante",
          "flyback chronograph",
          "u-30"
        ]
      },
      {
        "display_name": "U40",
        "search_aliases": [
          "racing flying tourbillon",
          "u-40"
        ]
      },
      {
        "display_name": "U50",
        "search_aliases": [
          "diver tourbillon",
          "u-50"
        ]
      },
      {
        "display_name": "Instrument",
        "search_aliases": [
          "u10 tourbillon lumiere",
          "u-10"
        ]
      }
    ]
  },
  {
    "id": "brand_006",
    "name": "Anordain",
    "founding_snippet": "Founded in Glasgow, Scotland, in 2015 by Lewis Heath. The independent studio has taken the watch world by storm by reviving the incredibly difficult, slow art of traditional vitreous (fired) enamel dial making, paired with clean, typographic Scottish design.",
    "models": [
      {
        "display_name": "Model 1",
        "search_aliases": [
          "three hand",
          "enamel",
          "model one"
        ]
      },
      {
        "display_name": "Model 1 GMT",
        "search_aliases": [
          "gmt",
          "enamel gmt"
        ]
      },
      {
        "display_name": "Model 2",
        "search_aliases": [
          "field watch",
          "enamel",
          "model two"
        ]
      },
      {
        "display_name": "Model 3",
        "search_aliases": [
          "method studio",
          "model three"
        ]
      }
    ]
  },
  {
    "id": "brand_007",
    "name": "Antoine Martin",
    "founding_snippet": "Launched in 2011 by master watchmaker Martin Braun. The brand carved out a highly specific technical legacy by engineering modern, slow-beating movements featuring massive, oversized high-efficiency silicium balance wheels operating at unprecedentedly low frequencies.",
    "models": [
      {
        "display_name": "Slow Runner",
        "search_aliases": [
          "1hz",
          "7200 vph",
          "7,200",
          "slow-beat",
          "silicium"
        ]
      },
      {
        "display_name": "Quantième Perpétuel",
        "search_aliases": [
          "perpetual calendar",
          "quantieme perpetuel"
        ]
      },
      {
        "display_name": "Tourbillon Quantième Perpétuel",
        "search_aliases": [
          "tourbillon perpetual calendar"
        ]
      }
    ]
  },
  {
    "id": "brand_008",
    "name": "Antoine Preziuso",
    "founding_snippet": "Established in Geneva by independent master watchmaker Antoine Preziuso, an early pioneer of the modern independent movement and AHCI member. The brand is universally acclaimed for pushing the physical limits of gravity-defying complications, most notably their multi-axis and triple-tourbillon setups.",
    "models": [
      {
        "display_name": "Tourbillon of Tourbillons",
        "search_aliases": [
          "triple tourbillon",
          "multi axis"
        ]
      },
      {
        "display_name": "Chronometer T-Rex",
        "search_aliases": [
          "t-rex",
          "trex"
        ]
      },
      {
        "display_name": "Grand Tourbillon Sport",
        "search_aliases": [
          "gts"
        ]
      },
      {
        "display_name": "Monumental Tourbillon",
        "search_aliases": [
          "monumental"
        ]
      },
      {
        "display_name": "The Art of Tourbillon",
        "search_aliases": [
          "art"
        ]
      }
    ]
  },
  {
    "id": "brand_009",
    "name": "Armin Strom",
    "founding_snippet": "While master skeletonizer Armin Strom began his custom workshop in 1967, the brand was structurally transformed into a fully integrated modern manufacture in Biel/Bienne in 2006. They specialize in transparent architectural engineering, pioneering commercial resonance technology that physically links two balance wheels.",
    "models": [
      {
        "display_name": "Gravity Equal Force",
        "search_aliases": [
          "system 78",
          "gef",
          "equal force"
        ]
      },
      {
        "display_name": "Mirrored Force Resonance",
        "search_aliases": [
          "mfr",
          "resonance clutch spring"
        ]
      },
      {
        "display_name": "Pure Resonance",
        "search_aliases": [
          "dual regulator"
        ]
      },
      {
        "display_name": "Dual Time Resonance",
        "search_aliases": [
          "gmt resonance",
          "two time zones"
        ]
      },
      {
        "display_name": "One Week",
        "search_aliases": [
          "manufacture",
          "7 day power reserve"
        ]
      },
      {
        "display_name": "Orbit",
        "search_aliases": [
          "column wheel date chronograph",
          "date indicator"
        ]
      },
      {
        "display_name": "Tribute 1",
        "search_aliases": [
          "tribute one",
          "dress watch"
        ]
      }
    ]
  },
  {
    "id": "brand_010",
    "name": "Arnold & Son",
    "founding_snippet": "Named in honor of John Arnold, the legendary 18th-century British chronometer maker who collaborated closely with Abraham-Louis Breguet. The modern manufacture operates out of La Chaux-de-Fonds, Switzerland, crafting hyper-complex, visually symmetrical watches focused on high-end astronomy complications, deadbeat seconds, and multi-axis tourbillons.",
    "models": [
      {
        "display_name": "Nebula",
        "search_aliases": [
          "skeletonized",
          "symmetrical"
        ]
      },
      {
        "display_name": "Luna Magna",
        "search_aliases": [
          "3d spherical moon phase",
          "luna magna gold"
        ]
      },
      {
        "display_name": "Time Pyramid",
        "search_aliases": [
          "linear movement",
          "vertical skeleton"
        ]
      },
      {
        "display_name": "DSTB",
        "search_aliases": [
          "dial side true beat",
          "deadbeat seconds"
        ]
      },
      {
        "display_name": "Globetrotter",
        "search_aliases": [
          "world timer",
          "worldtime hemisphere"
        ]
      },
      {
        "display_name": "HM Double Hemisphere Perpetual Moon",
        "search_aliases": [
          "perpetual moon",
          "moonphase"
        ]
      },
      {
        "display_name": "Ultrathin Tourbillon",
        "search_aliases": [
          "ultra-thin tourbillon"
        ]
      },
      {
        "display_name": "Chronograph CTB",
        "search_aliases": [
          "ctb chronograph",
          "twin beating"
        ]
      }
    ]
  },
  {
    "id": "brand_011",
    "name": "ArtyA",
    "founding_snippet": "Founded in Geneva in 2009 by avant-garde designer Yvan Arpa. The brand is renowned for pushing the boundaries of traditional watchmaking by utilizing unorthodox materials like real lightning-struck cases, butterfly wings, and tobacco leaves combined with high-end tourbillon movements.",
    "models": [
      {
        "display_name": "Son of a Gun",
        "search_aliases": [
          "real bullets",
          "firearms theme",
          "target dial"
        ]
      },
      {
        "display_name": "Complications",
        "search_aliases": [
          "tiny patek master tourbillon",
          "purity tourbillon",
          "double axis tourbillon",
          "minute repeater"
        ]
      },
      {
        "display_name": "Shams",
        "search_aliases": [
          "skeleton",
          "transparent dial",
          "sun icon"
        ]
      },
      {
        "display_name": "Son of Earth",
        "search_aliases": [
          "butterfly wings",
          "tobacco leaf",
          "natural materials"
        ]
      },
      {
        "display_name": "Race",
        "search_aliases": [
          "spinning rim",
          "automotive theme",
          "dashboard"
        ]
      }
    ]
  },
  {
    "id": "brand_012",
    "name": "Audemars Piguet",
    "founding_snippet": "Established in 1875 in Le Brassus by Jules Louis Audemars and Edward Auguste Piguet. As one of the historic 'Holy Trinity' of Swiss watchmaking, the brand remains independently owned and is world-famous for inventing the luxury stainless steel sports watch segment in 1972.",
    "models": [
      {
        "display_name": "Royal Oak",
        "search_aliases": [
          "15500",
          "15202",
          "jumbo",
          "50th anniversary",
          "selfwinding",
          "gérald genta"
        ]
      },
      {
        "display_name": "Royal Oak Offshore",
        "search_aliases": [
          "roo",
          "chronograph",
          "diver",
          "rubber clad",
          "beast"
        ]
      },
      {
        "display_name": "Royal Oak Concept",
        "search_aliases": [
          "supersonnerie",
          "flying tourbillon",
          "laptimer",
          "futuristic"
        ]
      },
      {
        "display_name": "Code 11.59",
        "search_aliases": [
          "code 1159",
          "perpetual calendar",
          "starwheel",
          "chronograph cal 4401"
        ]
      },
      {
        "display_name": "Millenary",
        "search_aliases": [
          "oval case",
          "mecanique",
          "escapement",
          "openworked"
        ]
      }
    ]
  },
  {
    "id": "brand_013",
    "name": "Autodromo",
    "founding_snippet": "Founded in 2011 by industrial designer Bradley Price. Based in the United States, the independent brand crafts minimalist, design-forward watches that draw pure aesthetic inspiration from vintage motorsport dashboard instruments and racing culture.",
    "models": [
      {
        "display_name": "Group B",
        "search_aliases": [
          "bimetallic case",
          "lightweight",
          "rally racing",
          "series 2",
          "series 3"
        ]
      },
      {
        "display_name": "Prototipo",
        "search_aliases": [
          "chronograph",
          "meca-quartz",
          "targa florio",
          "vic elford"
        ]
      },
      {
        "display_name": "Intereuropa",
        "search_aliases": [
          "manual wind",
          "berlinetta",
          "gauge dial",
          "classic car"
        ]
      },
      {
        "display_name": "Vallelunga",
        "search_aliases": [
          "chronograph",
          "minimalist tachometer",
          "quartz"
        ]
      }
    ]
  },
  {
    "id": "brand_014",
    "name": "Ball Watch Company",
    "founding_snippet": "Founded in 1891 by Webb C. Ball in Cleveland, Ohio, following the Kipton train wreck. The brand established the historic 'Railroad Standard' parameters for absolute accuracy and durability, and is modernly famous for its continuous-glow tritium gas tube illumination.",
    "models": [
      {
        "display_name": "Engineer II",
        "search_aliases": [
          "marvelight",
          "magneto",
          "tritium tubes",
          "everyday sports"
        ]
      },
      {
        "display_name": "Engineer III",
        "search_aliases": [
          "marvelight chronometer",
          "king",
          "outlier gmt",
          "904l steel"
        ]
      },
      {
        "display_name": "Engineer Hydrocarbon",
        "search_aliases": [
          "submarine warfare",
          "nedubd",
          "crown protection system",
          "deep diver"
        ]
      },
      {
        "display_name": "Trainmaster",
        "search_aliases": [
          "railroad standard",
          "cleveland express",
          "moonphase",
          "manufacture cal"
        ]
      },
      {
        "display_name": "Fireman",
        "search_aliases": [
          "enterprise",
          "racer",
          "night train",
          "entry tier"
        ]
      }
    ]
  },
  {
    "id": "brand_015",
    "name": "Baltic Watches",
    "founding_snippet": "Founded in France in 2017 by Etienne Malec as a tribute to his late father's watch collection. Baltic exploded in popularity by offering perfectly proportioned, accessibly priced neo-vintage watches reminiscent of mid-century step-case and sector-dial designs.",
    "models": [
      {
        "display_name": "Aquascaphe",
        "search_aliases": [
          "diver",
          "gmt",
          "dual-crown",
          "compressor",
          "beads of rice"
        ]
      },
      {
        "display_name": "MR01",
        "search_aliases": [
          "micro-rotor",
          "micro rotor",
          "sector dial",
          "cal Hangzhou 5000a",
          "salmon dial"
        ]
      },
      {
        "display_name": "Bicompax",
        "search_aliases": [
          "001",
          "002",
          "manual wind chronograph",
          "st1901",
          "pulso"
        ]
      },
      {
        "display_name": "Tricompax",
        "search_aliases": [
          "three register chronograph",
          "panda dial",
          "peter auto"
        ]
      },
      {
        "display_name": "Hermétique",
        "search_aliases": [
          "tourer",
          "flat sapphire",
          "field watch",
          "integrated crown"
        ]
      }
    ]
  },
  {
    "id": "brand_016",
    "name": "Bell & Ross",
    "founding_snippet": "Launched in 1992 by Bruno Belamich and Carlos A. Rosillo. Initially manufacturing watches via Sinn, the brand established its iconic identity with the 'circle in a square' cockpit instrument design, prioritizing extreme legibility for pilots and divers.",
    "models": [
      {
        "display_name": "BR 03",
        "search_aliases": [
          "br03",
          "41mm",
          "cockpit instrument",
          "ceramic auto",
          "phantom",
          "gyrocompass"
        ]
      },
      {
        "display_name": "BR 05",
        "search_aliases": [
          "br05",
          "integrated bracelet",
          "sports watch",
          "gmt",
          "chrono",
          "skeleton"
        ]
      },
      {
        "display_name": "BR 01",
        "search_aliases": [
          "br01",
          "46mm",
          "oversized square",
          "original pilot instrument"
        ]
      },
      {
        "display_name": "BR V2",
        "search_aliases": [
          "brv2",
          "vintage round case",
          "aeronavale",
          "military travel gmt"
        ]
      },
      {
        "display_name": "BR-X1",
        "search_aliases": [
          "brx1",
          "hyper-horology",
          "skeleton chronograph",
          "forged carbon"
        ]
      }
    ]
  },
  {
    "id": "brand_017",
    "name": "Berneron",
    "founding_snippet": "An ultra-high-end independent brand founded in 2023 by watch designer Sylvain Berneron (former creative director at Breitling). The brand focuses on organic geometry, ensuring that the asymmetric exterior shape of the watch is dictated purely by the custom architecture of the in-house movement inside.",
    "models": [
      {
        "display_name": "Mirage",
        "search_aliases": [
          "aspherical case",
          "sienna",
          "indie design",
          "solid gold movement",
          "shaped caliber"
        ]
      }
    ]
  },
  {
    "id": "brand_018",
    "name": "Blancpain",
    "founding_snippet": "Founded in 1735 by Jehan-Jacques Blancpain in Villeret, Switzerland. It is officially recognized as the world's oldest registered watchmaking brand. Famously revived by Jean-Claude Biver in 1983 under the motto that the company has never made a quartz watch and never will, it invented the modern dive watch in 1953.",
    "models": [
      {
        "display_name": "Fifty Fathoms",
        "search_aliases": [
          "5015",
          "milspec",
          "no rad",
          "barracuda",
          "bathyscaphe",
          "1953 dive watch",
          "co-axial auto"
        ]
      },
      {
        "display_name": "Villeret",
        "search_aliases": [
          "quantieme complet",
          "complete calendar",
          "carrousel",
          "ultra-slim",
          "traditional dress"
        ]
      },
      {
        "display_name": "Air Command",
        "search_aliases": [
          "flyback chronograph",
          "military pilot",
          "countdown bezel"
        ]
      },
      {
        "display_name": "Léman",
        "search_aliases": [
          "dual time",
          "alarm complication",
          "military dial",
          "discontinued vintage"
        ]
      }
    ]
  },
  {
    "id": "brand_019",
    "name": "Breguet",
    "founding_snippet": "Founded in Paris in 1775 by Abraham-Louis Breguet, widely considered the greatest horological genius of all time. Breguet invented the tourbillon, the self-winding watch, the pare-chute shock absorber, and Breguet overcoil hairspring. The modern manufacture operates out of L'Abbaye, Switzerland, preserving its legendary hand-guilloché dials and coin-edge cases.",
    "models": [
      {
        "display_name": "Tradition",
        "search_aliases": [
          "7097",
          "7057",
          "openworked",
          "front-facing caliber",
          "michel era design",
          "manual-wind high power reserve"
        ]
      },
      {
        "display_name": "Classique",
        "search_aliases": [
          "5177",
          "7147",
          "grand feu enamel",
          "hand guilloché",
          "coin edge",
          "ultra thin dress"
        ]
      },
      {
        "display_name": "Marine",
        "search_aliases": [
          "5517",
          "chronograph",
          "alarme musicale",
          "sports luxury",
          "rubber strap"
        ]
      },
      {
        "display_name": "Type XX / XXI / XXII",
        "search_aliases": [
          "type 20",
          "type 21",
          "flyback pilot chronograph",
          "french air force",
          "high frequency 10hz"
        ]
      },
      {
        "display_name": "Reine de Naples",
        "search_aliases": [
          "oval ladies watch",
          "egg shaped case",
          "moonphase"
        ]
      }
    ]
  },
  {
    "id": "brand_020",
    "name": "Breitling",
    "founding_snippet": "Established in 1884 by Léon Breitling in Saint-Imier, Switzerland. The brand is globally recognized as a pioneer of the modern wrist chronograph, inventing the dedicated independent chronograph pusher setup and cementing an enduring legacy across commercial, military, and recreational aviation.",
    "models": [
      {
        "display_name": "Navitimer",
        "search_aliases": [
          "b01",
          "slide rule bezel",
          "pilot chronograph",
          "cosmonaute",
          "aopa"
        ]
      },
      {
        "display_name": "Chronomat",
        "search_aliases": [
          "rouleaux bracelet",
          "rider tabs",
          "two-tone chronomat",
          "b01 chronograph",
          "frecce tricolori"
        ]
      },
      {
        "display_name": "Superocean",
        "search_aliases": [
          "heritage b20",
          "slow motion",
          "dive watch",
          "mesh bracelet"
        ]
      },
      {
        "display_name": "Premier",
        "search_aliases": [
          "duograph",
          "datora 42",
          "b09 manual wind",
          "pistachio dial",
          "heritage chronograph"
        ]
      },
      {
        "display_name": "Avenger",
        "search_aliases": [
          "gmt",
          "seawolf",
          "military pilot",
          "stencil numerals"
        ]
      },
      {
        "display_name": "Aerospace",
        "search_aliases": [
          "ana-digi",
          "superquartz",
          "titanium flight watch",
          "evo"
        ]
      }
    ]
  },
  {
    "id": "brand_021",
    "name": "Bremont",
    "founding_snippet": "Founded in 2002 by brothers Nick and Giles English in England. The brand is deeply rooted in aviation and military partnerships, engineering rugged, highly durable tool watches featuring their signature three-piece 'Trip-Tick' case construction and advanced shock-protection systems.",
    "models": [
      {
        "display_name": "Supermarine",
        "search_aliases": [
          "s300",
          "s500",
          "s502",
          "300m",
          "500m",
          "dive watch",
          "polar white",
          "ceramic bezel",
          "maritime"
        ]
      },
      {
        "display_name": "Altitude",
        "search_aliases": [
          "mb meteor",
          "chronograph gmt",
          "martin-baker",
          "ejection seat",
          "felix the cat",
          "pilot watch",
          "aviation"
        ]
      },
      {
        "display_name": "Terra Nova",
        "search_aliases": [
          "field watch",
          "jumping hour 1776",
          "turning bezel",
          "power reserve",
          "cushion case",
          "military dial"
        ]
      },
      {
        "display_name": "Supernova",
        "search_aliases": [
          "integrated bracelet",
          "904l steel",
          "eng300",
          "luxury sports watch"
        ]
      },
      {
        "display_name": "Fury",
        "search_aliases": [
          "polished trip-tick",
          "flieger",
          "pilot automatic",
          "henley-on-thames"
        ]
      },
      {
        "display_name": "Audley",
        "search_aliases": [
          "dress watch",
          "eng365",
          "65 hour power reserve",
          "clean bezel"
        ]
      }
    ]
  },
  {
    "id": "brand_022",
    "name": "Bovet 1822",
    "founding_snippet": "Founded in 1822 by Édouard Bovet in Fleurier, Switzerland. The historical maison became famous for creating highly ornate pocket watches for the Chinese empire. Modernly revived under Pascal Raffy, Bovet operates as a completely vertically integrated manufacture crafting hyper-artistic haute horlogerie, recognized for its convertible 'Amadéo' cases and signature 12 o'clock crown placement.",
    "models": [
      {
        "display_name": "19Thirty",
        "search_aliases": [
          "19thirty fleurier",
          "dimier case",
          "7 day power reserve",
          "single barrel manual wind",
          "guilloché",
          "côtes de genève"
        ]
      },
      {
        "display_name": "Récital",
        "search_aliases": [
          "recital 26 brainstorm",
          "recital 28 prowess",
          "writing slope case",
          "astronomical tourbillon",
          "world timer",
          "chapter two",
          "asymmetrical profile"
        ]
      },
      {
        "display_name": "Virtuoso",
        "search_aliases": [
          "virtuoso vii",
          "virtuoso viii",
          "virtuoso xi",
          "openwork tourbillon",
          "hand engraved bridges",
          "perpetual calendar"
        ]
      },
      {
        "display_name": "Amadéo Fleurier",
        "search_aliases": [
          "amadeo convertible system",
          "pocket watch conversion",
          "table clock",
          "skeleton tourbillon",
          "reverse hand indications"
        ]
      },
      {
        "display_name": "Bovet by Pininfarina",
        "search_aliases": [
          "ottantasei",
          "aperto 1",
          "flying tourbillon",
          "collaborative sports case",
          "modern architecture"
        ]
      }
    ]
  },
  {
    "id": "brand_023",
    "name": "Bulgari",
    "founding_snippet": "Founded in Rome in 1884 by Sotirios Voulgaris as a luxury jewelry house. The brand merged high Italian jewelry design with high-end Swiss engineering by acquiring Daniel Roth and Gérald Genta, subsequently breaking world records for ultra-thin watchmaking under its dedicated manufacture in Neuchâtel.",
    "models": [
      {
        "display_name": "Octo Finissimo",
        "search_aliases": [
          "octo finissimo automatic",
          "gérald genta geometry",
          "titanium ultra thin",
          "chronograph gmt",
          "perpetual calendar",
          "tourbillon skeleton",
          "bvl 138"
        ]
      },
      {
        "display_name": "Octo Roma",
        "search_aliases": [
          "octo roma automatic",
          "cushion case",
          "clous de paris dial",
          "worldtimer",
          "chronograph"
        ]
      },
      {
        "display_name": "Bulgari Bulgari",
        "search_aliases": [
          "bvlgari bvlgari",
          "double logo bezel",
          "solotempo",
          "carbon gold",
          "retro style"
        ]
      },
      {
        "display_name": "Serpenti",
        "search_aliases": [
          "serpenti tubogas",
          "serpenti seduttori",
          "snake watch",
          "coiled wrap bracelet",
          "high jewelry"
        ]
      }
    ]
  },
  {
    "id": "brand_024",
    "name": "Carl F. Bucherer",
    "founding_snippet": "Established in Lucerne, Switzerland, in 1888 by Carl Friedrich Bucherer. Operating as an independent family-owned manufacturer for generations before integrating into modern retail structures, the manufacture is technically renowned for pioneering and perfecting functional peripheral rotor automatic winding systems.",
    "models": [
      {
        "display_name": "Manero Peripheral",
        "search_aliases": [
          "peripheral rotor",
          "manero flyback chronograph",
          "manero minute repeater",
          "tourbillon peripheral",
          "bcal cfb a1000"
        ]
      },
      {
        "display_name": "Patravi ScubaTec",
        "search_aliases": [
          "scubatec diver",
          "500m water resistant",
          "patravi traveltec gmt",
          "three time zones",
          "rugged tool watch"
        ]
      },
      {
        "display_name": "Heritage",
        "search_aliases": [
          "heritage bicompax annual",
          "annual calendar chronograph",
          "lucerne 1888",
          "retro design"
        ]
      }
    ]
  },
  {
    "id": "brand_025",
    "name": "Cartier",
    "founding_snippet": "Founded in Paris in 1847 by Louis-François Cartier. Reveled as the 'Jeweler of Kings and the King of Jewelers,' the house shaped modern horology by inventing the first purpose-built men's wristwatch in 1904 for aviator Alberto Santos-Dumont, permanently establishing shaped-case watch design templates.",
    "models": [
      {
        "display_name": "Santos de Cartier",
        "search_aliases": [
          "santos dumont",
          "santos medium",
          "santos large",
          "square bezel with screws",
          "quickswitch system",
          "aviator watch"
        ]
      },
      {
        "display_name": "Tank",
        "search_aliases": [
          "tank louis cartier",
          "tank francaise",
          "tank americaine",
          "tank must",
          "tank solo",
          "brancards case",
          "roman numerals"
        ]
      },
      {
        "display_name": "Ballon Bleu de Cartier",
        "search_aliases": [
          "ballon bleu",
          "pebble case",
          "enclosed crown guard",
          "convex cabochon"
        ]
      },
      {
        "display_name": "Pasha de Cartier",
        "search_aliases": [
          "pasha grid",
          "chained crown cap",
          "round case square tracks",
          "gérald genta pasha"
        ]
      },
      {
        "display_name": "Privé / Collections Privées",
        "search_aliases": [
          "cartier crash",
          "tank cintrée",
          "asymétrique",
          "tonneau",
          "tortue monopoussoir",
          "cpcp",
          "haute horlogerie"
        ]
      },
      {
        "display_name": "Panthère de Cartier",
        "search_aliases": [
          "panthere watch",
          "jewelry brick bracelet",
          "square ladies watch"
        ]
      }
    ]
  },
  {
    "id": "brand_026",
    "name": "Dufour (Philippe Dufour)",
    "founding_snippet": "Established in the Vallée de Joux by living legend Philippe Dufour, widely considered the master of modern classical watchmaking and hand-finishing. Operating with absolute independence, Dufour creates vanishingly small numbers of completely hand-sculpted watches that set the global gold standard for movement decoration.",
    "models": [
      {
        "display_name": "Simplicity",
        "search_aliases": [
          "philippe dufour simplicity",
          "34mm",
          "37mm",
          "manual wind time-only",
          "guilloché",
          "lacquer dial",
          "ultimate finishing",
          "inner angles"
        ]
      },
      {
        "display_name": "Duality",
        "search_aliases": [
          "dufour duality",
          "dual escapement",
          "differential movement",
          "ultra rare independent"
        ]
      },
      {
        "display_name": "Grande Sonnerie",
        "search_aliases": [
          "grande sonnerie pocket watch",
          "grande et petite sonnerie wristwatch",
          "minute repeater"
        ]
      }
    ]
  },
  {
    "id": "brand_027",
    "name": "Ebel",
    "founding_snippet": "Founded in 1911 by Eugene Blum and Alice Levy in La Chaux-de-Fonds, Switzerland. Famous for its fluid design language, the brand dominated the luxury landscape in the 1970s and 1980s with its iconic wave-link integrated bracelets, soft hexagonal cases, and the high-end cal. 137 chronograph movement.",
    "models": [
      {
        "display_name": "Sport Classic",
        "search_aliases": [
          "wave bracelet",
          "screwed bezel",
          "unisex quartz",
          "two tone classic"
        ]
      },
      {
        "display_name": "1911",
        "search_aliases": [
          "1911 chronometer",
          "ebel 137 el primero",
          "discovery diver",
          "tekton chronograph"
        ]
      },
      {
        "display_name": "Beluga",
        "search_aliases": [
          "beluga diamonds",
          "ladies jewelry watch",
          "fluid case"
        ]
      }
    ]
  },
  {
    "id": "brand_028",
    "name": "Eberhard & Co.",
    "founding_snippet": "Founded in 1887 by Georges Eberhard in La Chaux-de-Fonds, Switzerland. The historical manufacturer carved out an elite status in military and civil aviation timing, modernly celebrated for its patented linear multi-counter chronograph layouts.",
    "models": [
      {
        "display_name": "Chrono 4",
        "search_aliases": [
          "chrono4",
          "four inline registers",
          "gebaseerd op cal 251",
          "temerario",
          "linear chronograph"
        ]
      },
      {
        "display_name": "Scafograf",
        "search_aliases": [
          "scafograf 300",
          "scafograf gmt",
          "vintage diver reissue",
          "helium valve"
        ]
      },
      {
        "display_name": "Extra-Fort",
        "search_aliases": [
          "extrafort automatic",
          "classic dress chronograph",
          "retro leaf hands"
        ]
      },
      {
        "display_name": "Tazio Nuvolari",
        "search_aliases": [
          "nuvolari chronograph",
          "vintage racing theme",
          "coin edge bezel"
        ]
      }
    ]
  },
  {
    "id": "brand_029",
    "name": "Edox",
    "founding_snippet": "Established in 1884 by Christian Ruefli-Flury in Biel/Bienne, Switzerland. Edox pioneered early water-resistance engineering with its famous 'Delfin' double-O-ring crown system in 1961, cementing a legacy built on extreme maritime tool watches and high-speed offshore racing sponsorships.",
    "models": [
      {
        "display_name": "Delfin",
        "search_aliases": [
          "delfin original",
          "the water champion",
          "double o-ring",
          "retro 1970s diver"
        ]
      },
      {
        "display_name": "CO-1",
        "search_aliases": [
          "co1 carbon",
          "offshore chronograph",
          "1000m deep diver",
          "ceramic bezel"
        ]
      },
      {
        "display_name": "Chronorally",
        "search_aliases": [
          "oversized pusher",
          "wrc rally chronograph",
          "titanium motorsport"
        ]
      },
      {
        "display_name": "Les Bémonts",
        "search_aliases": [
          "les bemonts ultra slim",
          "eccentric dial",
          "dress mechanical"
        ]
      }
    ]
  },
  {
    "id": "brand_030",
    "name": "Eichi (Seiko / Credor Context)",
    "founding_snippet": "A specialized database routing index designated for the legendary Eichi architectural series hand-crafted at the Micro Artist Studio in Shiojiri, Japan. This maps user queries specifically seeking porcelain-dial precision engineering.",
    "models": [
      {
        "display_name": "Eichi I / II",
        "search_aliases": [
          "credor eichi",
          "gblt999",
          "spring drive 7r14",
          "porcelain dial",
          "hand painted logo"
        ]
      }
    ]
  },
  {
    "id": "brand_031",
    "name": "Elka Watch Co.",
    "founding_snippet": "A historic brand originally founded in Amsterdam, beautifully revived in 2022 by watch industry veteran Hakim El Kadiri. The independent brand centers its identity on clean, mid-century watch aesthetics, pulling direct inspiration from flight chronographs and pocket watches from the Elka archives.",
    "models": [
      {
        "display_name": "X Series",
        "search_aliases": [
          "x01",
          "x02",
          "flight instrument dial",
          "cheve glass",
          "la joux-perret movement"
        ]
      },
      {
        "display_name": "D Series",
        "search_aliases": [
          "d01",
          "minimalist sector dial",
          "vintage cushion profile",
          "retro dress watch"
        ]
      }
    ]
  },
  {
    "id": "brand_032",
    "name": "Enicar",
    "founding_snippet": "Founded in 1913 by Ariste Racine (spelling his surname backward) in La Chaux-de-Fonds, Switzerland. Enicar earned legendary tool-watch status mid-century by equipping Himalayan mountaineers and racing drivers, universally collected for its robust EPSA compressor cases and in-house 'Sherpa' calibers.",
    "models": [
      {
        "display_name": "Sherpa Guide",
        "search_aliases": [
          "gmt world time",
          "compressor case",
          "inner rotating bezel",
          "vintage tool watch"
        ]
      },
      {
        "display_name": "Sherpa Graph",
        "search_aliases": [
          "valjoux 72 chronograph",
          "jim clark",
          "vintage racing chronograph",
          "jet graph"
        ]
      },
      {
        "display_name": "Sherpa Dive",
        "search_aliases": [
          "sherpa ultra dive",
          "super-compressor",
          "dual crown diver"
        ]
      },
      {
        "display_name": "Star Jewels",
        "search_aliases": [
          "vintage enicar automatic",
          "ar caliber",
          "dress vintage"
        ]
      }
    ]
  },
  {
    "id": "brand_033",
    "name": "Epos",
    "founding_snippet": "Established in 1983 by Peter Hofer in Grenchen, Switzerland, specifically to preserve mechanical watchmaking traditions during the quartz crisis. The independent manufacture is known for offering traditional Swiss complications—like moon phases, regulators, and openworked dials—at an accessible price tier.",
    "models": [
      {
        "display_name": "Oeuvre d'Art",
        "search_aliases": [
          "big moon phase",
          "3440 vers0",
          "retrograde indication",
          "skeleton tourbillon"
        ]
      },
      {
        "display_name": "Emotion",
        "search_aliases": [
          "night sky dial",
          "24 hour regulator",
          "classical coin edge case"
        ]
      },
      {
        "display_name": "Sportive",
        "search_aliases": [
          "epos diver 300m",
          "skeleton sport",
          "integrated composite case"
        ]
      },
      {
        "display_name": "Originale",
        "search_aliases": [
          "ultra thin manual wind",
          "peseux 7001",
          "classic Roman markers"
        ]
      }
    ]
  },
  {
    "id": "brand_034",
    "name": "Excelsior Park",
    "founding_snippet": "Historically established in 1866 in Saint-Imier, Switzerland, as an elite manufacturer of specialized stopwatches and chronograph calibers (supplying brands like Zenith and Gallet). The historic name was revived in 2020, focusing on faithful re-editions of their mid-century pilot and racing chronographs.",
    "models": [
      {
        "display_name": "Chronograph",
        "search_aliases": [
          "ep01",
          "sellita sw510",
          "manual wind chronograph",
          "sector dial",
          "oval pushers",
          "historical reissue"
        ]
      }
    ]
  },
  {
    "id": "brand_035",
    "name": "F.P. Journe",
    "founding_snippet": "Founded in Geneva in 1999 by master horologist François-Paul Journe under the motto 'Invenit et Fecit' (Invented and Made). Representing the absolute apex of modern independent watchmaking, Journe is world-renowned for crafting entire movements out of solid 18k rose gold, engineering highly innovative resonance and constant-force calibers.",
    "models": [
      {
        "display_name": "Chronomètre Bleu",
        "search_aliases": [
          "chronometre bleu",
          "cb",
          "tantalum case",
          "chrome blue dial",
          "calibre 1304 gold movement",
          "stealth luxury"
        ]
      },
      {
        "display_name": "Chronomètre Souverain",
        "search_aliases": [
          "cs",
          "manual wind power reserve",
          "decentralized seconds",
          "gold caliber"
        ]
      },
      {
        "display_name": "Tourbillon Souverain",
        "search_aliases": [
          "tourbillon avec remontoir d'egalite",
          "constant force device",
          "deadbeat seconds",
          "tn"
        ]
      },
      {
        "display_name": "Chronomètre à Résonance",
        "search_aliases": [
          "resonance",
          "dual acoustic balance wheels",
          "synchronicity movement",
          "rq"
        ]
      },
      {
        "display_name": "Octa Automatic",
        "search_aliases": [
          "octa divine",
          "octa chrono",
          "octa reserve de marche",
          "120 hour power reserve",
          "calibre 1300"
        ]
      },
      {
        "display_name": "Linesport",
        "search_aliases": [
          "centigraphe sport",
          "octa sport",
          "aluminum movement",
          "titanium case integrated"
        ]
      },
      {
        "display_name": "Élégante",
        "search_aliases": [
          "elegante 48",
          "elegante 40",
          "electro-mechanical",
          "motion sensor quartz",
          "luminous dial"
        ]
      }
    ]
  },
  {
    "id": "brand_036",
    "name": "Favre-Leuba",
    "founding_snippet": "With origins dating back to 1737 in Le Locle under Abraham Favre, it represents one of the oldest Swiss watchmaking lineages in history. The brand established an incredible 20th-century tool-watch footprint by engineering the first mechanical wristwatches with integrated altimeters and barometers.",
    "models": [
      {
        "display_name": "Bivouac",
        "search_aliases": [
          "bivouac 9000",
          "mechanical altimeter watch",
          "barometer",
          "titanium cushion case"
        ]
      },
      {
        "display_name": "Raider Harpoon",
        "search_aliases": [
          "ultimate diver",
          "single hour hand display",
          "helium valve 500m"
        ]
      },
      {
        "display_name": "Sea Chief",
        "search_aliases": [
          "vintage retro dress",
          "manual wind automatic",
          "sea king"
        ]
      }
    ]
  },
  {
    "id": "brand_037",
    "name": "Fears Watch Company",
    "founding_snippet": "Originally founded in Bristol, England, in 1846 by Edwin Fears, the historic British house was brilliantly revived in 2016 by his great-great-great-grandson Nicholas Bowman-Scargill. The independent brand focuses on flawless, elegant dress watches characterized by traditional British cushion cases and bespoke custom dial typography.",
    "models": [
      {
        "display_name": "Brunswick",
        "search_aliases": [
          "brunswick salmon",
          "brunswick pt",
          "cushion case mechanical",
          "manual wind top-grade eta",
          "british watchmaking"
        ]
      },
      {
        "display_name": "Redcliff",
        "search_aliases": [
          "redcliff automatic",
          "round case everyday sports",
          "la joux-perret caliber"
        ]
      },
      {
        "display_name": "Archival",
        "search_aliases": [
          "archival rectangular",
          "vintage new old stock movement",
          "anniversary edition"
        ]
      }
    ]
  },
  {
    "id": "brand_038",
    "name": "Formex",
    "founding_snippet": "Founded in 1999 in Biel/Bienne, Switzerland, by the Elia brothers. Formex carved out a highly specialized technical niche by inventing and patenting a unique mechanical 'Case Suspension System' that integrates shock absorbers into the case chassis to maximize wrist comfort and movement protection.",
    "models": [
      {
        "display_name": "Essence",
        "search_aliases": [
          "essence thirty-nine",
          "essence forty-one",
          "cosc chronometer",
          "case suspension",
          "wire-cut dial",
          "everyday sports"
        ]
      },
      {
        "display_name": "Reef",
        "search_aliases": [
          "reef diver 300m",
          "interchangeable bezel system",
          "cosc automatic",
          "ceramic diver"
        ]
      },
      {
        "display_name": "Leggera",
        "search_aliases": [
          "essence leggera",
          "carbon fiber case",
          "ultra lightweight sport"
        ]
      }
    ]
  },
  {
    "id": "brand_039",
    "name": "Fortis",
    "founding_snippet": "Established in 1912 by Walter Vogt in Grenchen, Switzerland. Fortis pioneered early commercial mass-production of automatic wristwatches alongside John Harwood in 1926, and permanently cemented its modern legacy as the official timekeeper for the Russian ROSCOSMOS space program, proving its mechanical chronographs in open space.",
    "models": [
      {
        "display_name": "Official Cosmonauts",
        "search_aliases": [
          "cosmonaut chronograph",
          "b-42",
          "lemania 5100",
          "werk 13",
          "space flight watch",
          "roscosmos"
        ]
      },
      {
        "display_name": "Flieger",
        "search_aliases": [
          "flieger f-39",
          "flieger f-41",
          "f-43 triple-gmt",
          "synchroline",
          "pilot tool watch"
        ]
      },
      {
        "display_name": "Marinemaster",
        "search_aliases": [
          "marinemaster m-40",
          "marinemaster m-44",
          "gear bezel dive watch",
          "o-ring seal"
        ]
      },
      {
        "display_name": "Novonaut",
        "search_aliases": [
          "novonaut amadee",
          "space chronograph calculation",
          "manufacture cal approved"
        ]
      }
    ]
  },
  {
    "id": "brand_040",
    "name": "Franck Muller",
    "founding_snippet": "Founded in Geneva in 1991 by watchmaker Franck Muller and case-maker Vartan Sirmakes. Known as the 'Master of Complications,' the brand dominated 1990s pop culture and haute horlogerie by pioneering the highly distinctive, curved 'Cintrée Curvex' tonneau case and building hyper-complex world-first movements like the Crazy Hours and Aeternitas Mega.",
    "models": [
      {
        "display_name": "Cintrée Curvex",
        "search_aliases": [
          "vanguard",
          "casablanca",
          "tonneau curved case",
          "art deco numerals",
          "color dreams"
        ]
      },
      {
        "display_name": "Crazy Hours",
        "search_aliases": [
          "crazyhours",
          "jumping hours non-sequential",
          "eccentric complication"
        ]
      },
      {
        "display_name": "Master Banker",
        "search_aliases": [
          "three distinct time zones",
          "single movement crown regulation",
          "financial traveler"
        ]
      },
      {
        "display_name": "Giga Tourbillon",
        "search_aliases": [
          "giga tourbillon skeleton",
          "massive 20mm tourbillon cage",
          "double barrel manual"
        ]
      },
      {
        "display_name": "Long Island",
        "search_aliases": [
          "rectangular classic case",
          "art deco dress watch"
        ]
      }
    ]
  },
  {
    "id": "brand_041",
    "name": "Frédérique Constant",
    "founding_snippet": "Founded in 1988 by Aletta and Peter Stas in Geneva. Positioned on the core philosophy of 'accessible luxury,' the brand achieved vertical manufacture integration in 2004 and is highly regarded for engineering high-end Swiss complications—like flyback chronographs, perpetual calendars, and monolithic oscillators—at industry-disrupting value tiers.",
    "models": [
      {
        "display_name": "Highlife",
        "search_aliases": [
          "highlife automatic COSC",
          "integrated bracelet sports watch",
          "perpetual calendar highlife",
          "worldtimer"
        ]
      },
      {
        "display_name": "Classic Manufacture",
        "search_aliases": [
          "heart beat open heart",
          "in-house automatic movement",
          "fc-710",
          "classic dress moonphase"
        ]
      },
      {
        "display_name": "Slimline",
        "search_aliases": [
          "slimline perpetual calendar",
          "ultra thin manufacture cal",
          "moonphase manufacture"
        ]
      },
      {
        "display_name": "Monolithic",
        "search_aliases": [
          "slimline monolithic",
          "40hz silicon oscillator",
          "high frequency technological breakthrough"
        ]
      }
    ]
  },
  {
    "id": "brand_042",
    "name": "Furlan Marri",
    "founding_snippet": "Launched in 2021 by industrial designer Andrea Furlan and collector Hamad Al Marri. The independent brand took the global collectors' community by storm by crafting hyper-faithful, beautifully finished vintage homages, mimicking elite mid-century Patek Philippe case architectures (like the ref. 1463 'Tasti Tondi').",
    "models": [
      {
        "display_name": "Mecaquartz Chronograph",
        "search_aliases": [
          "ref 1011-a",
          "ref 1031-a",
          "tasti tondi pushers",
          "seiko vk64 engine",
          "vintage chronograph style",
          "mecha-quartz"
        ]
      },
      {
        "display_name": "Three-Hand Mechanical",
        "search_aliases": [
          "ref 2116-a",
          "cow-horn lugs",
          "la joux-perret automatic",
          "sector dial decored"
        ]
      },
      {
        "display_name": "Complications",
        "search_aliases": [
          "perpetual calendar secular",
          "dominique renaud collaboration",
          "haute complex design"
        ]
      }
    ]
  },
  {
    "id": "brand_043",
    "name": "Gallet & Co.",
    "founding_snippet": "Tracing an unbroken watchmaking lineage back to Humbertus Gallet in 1466, it represents the oldest clock and watch house in existence. The historic firm became the definitive mid-century standard for professional military, naval, and aviation timing, immortalized by their legendary 'Flying Officer' and 'MultiChron' chronograph configurations.",
    "models": [
      {
        "display_name": "Flying Officer",
        "search_aliases": [
          "vintage world time chronograph",
          "truman gallet",
          "rotating world time bezel",
          "clamshell case"
        ]
      },
      {
        "display_name": "MultiChron",
        "search_aliases": [
          "multichron 12",
          "multichron 45",
          "valjoux 72 movement",
          "excelsior park caliber",
          "vintage military navigator"
        ]
      },
      {
        "display_name": "Flight Officer",
        "search_aliases": [
          "military aviation navigational calculation",
          "vintage excel chronograph"
        ]
      }
    ]
  },
  {
    "id": "brand_044",
    "name": "Garrick",
    "founding_snippet": "Founded in 2014 by David Brailsford and master watchmaker Simon Michlmayr in Norfolk, England. Garrick champions high-end, low-volume British watchmaking, pairing hyper-traditional English engine-turned dials and maritime case geometry with their proprietary, prominent in-house free-sprung balance wheel calibers.",
    "models": [
      {
        "display_name": "S Series",
        "search_aliases": [
          "s1",
          "s2",
          "s3",
          "s4",
          "s5",
          "open balance wheel",
          "hand geared",
          "british watchmaking",
          "bespoke engine turned"
        ]
      },
      {
        "display_name": "Norfolk",
        "search_aliases": [
          "norfolk maritime",
          "grand feu enamel dial",
          "marine chronometer look"
        ]
      },
      {
        "display_name": "Regulator",
        "search_aliases": [
          "decentralized hour engine",
          "manual wind regulator"
        ]
      }
    ]
  },
  {
    "id": "brand_045",
    "name": "George Daniels",
    "founding_snippet": "The legendary independent legacy workshop of Dr. George Daniels, widely considered the greatest horologist of the 20th century. Working entirely by hand in the Isle of Man, Daniels invented the Co-Axial escapement (later adopted by Omega) and formulated the 'Daniels Method,' detailing how a single master artisan creates a watch from scratch without industrial automation.",
    "models": [
      {
        "display_name": "Space Traveller",
        "search_aliases": [
          "space traveller i",
          "space traveller ii",
          "mean solar time",
          "sidereal time",
          "chronograph independent trains",
          "ultimate independent watch"
        ]
      },
      {
        "display_name": "Anniversary",
        "search_aliases": [
          "daniels anniversary",
          "co-axial manual wind",
          "roger smith collaboration",
          "yellow gold hand-guilloché"
        ]
      },
      {
        "display_name": "Millennium",
        "search_aliases": [
          "millennium edition",
          "omega cal 2500 base",
          "coaxial modification"
        ]
      }
    ]
  },
  {
    "id": "brand_046",
    "name": "Gerald Genta (Gérald Genta)",
    "founding_snippet": "Originally founded in 1969 by the most influential watch designer in history, Gérald Genta. The brand established an avant-garde haute horlogerie reputation for combining Disney character jump-hour complications with hyper-complex minute repeaters and retrograde displays, recently revitalized as an elite boutique manufacture backed by La Fabrique du Temps Louis Vuitton.",
    "models": [
      {
        "display_name": "Arena",
        "search_aliases": [
          "arena bi-retro",
          "mickey mouse jump hour",
          "donald duck retrograde",
          "arena sport",
          "gefica bronz"
        ]
      },
      {
        "display_name": "Grand Sonnerie",
        "search_aliases": [
          "grande sonnerie tourbillon",
          "westminster chime",
          "octagonal hyper complication"
        ]
      },
      {
        "display_name": "Retrograde",
        "search_aliases": [
          "retro classic",
          "jumping hour automatic",
          "minimalist genta shell"
        ]
      }
    ]
  },
  {
    "id": "brand_047",
    "name": "Girard-Perregaux",
    "founding_snippet": "Tracing its origins to 1791 in La Chaux-de-Fonds, Switzerland. The historical powerhouse unified absolute horological art with engineering when Constant Girard released the Tourbillon with Three Gold Bridges in 1889, modernly renowned for pioneering the luxury integrated sports watch landscape with the iconic octagonal Laureato line.",
    "models": [
      {
        "display_name": "Laureato",
        "search_aliases": [
          "laureato automatic 42",
          "laureato chronograph",
          "clous de paris dial",
          "integrated steel sports",
          "ceramic laureato",
          "green dial",
          "cal GP01800"
        ]
      },
      {
        "display_name": "Laureato Fifty",
        "search_aliases": [
          "laureato 50th anniversary",
          "cal GP4800",
          "blue enamel dial",
          "rose gold dial",
          "39mm steel",
          "36mm steel",
          "integrated 2026 release"
        ]
      },
      {
        "display_name": "Bridges",
        "search_aliases": [
          "three gold bridges",
          "free bridge",
          "neo bridges tourbillon",
          "flying bridges minute repeater",
          "openworked architecture"
        ]
      },
      {
        "display_name": "1966",
        "search_aliases": [
          "1966 classic dress",
          "orion",
          "complete calendar",
          "ultra thin enamel"
        ]
      },
      {
        "display_name": "Vintage 1945",
        "search_aliases": [
          "art deco rectangular",
          "xxl chronograph",
          "large date moonphase"
        ]
      }
    ]
  },
  {
    "id": "brand_048",
    "name": "Glashütte Original",
    "founding_snippet": "Born from the unified collapse of the East German state-owned watchmaking conglomerates (GUB) in 1994, tracing roots to 1845 in Saxony. The integrated manufactory represents elite German watchmaking engineering, defined by asymmetrical dial geometry, three-quarter mainplates, and their signature 'Panorama Date' big-date systems.",
    "models": [
      {
        "display_name": "Pano",
        "search_aliases": [
          "panomaticlunar",
          "panoreserve",
          "panoinverse",
          "asymmetrical dial layout",
          "moonphase manual",
          "cal 90-02",
          "panorama date"
        ]
      },
      {
        "display_name": "Spezialist",
        "search_aliases": [
          "seaq",
          "seaq panorama date",
          "seaq diver 300m",
          "cal 36-13",
          "vintage skin diver reissue"
        ]
      },
      {
        "display_name": "Vintage",
        "search_aliases": [
          "seventies chronograph panorama date",
          "tv case sports watch",
          "sixties automatic",
          "fumé textured dial"
        ]
      },
      {
        "display_name": "Senator",
        "search_aliases": [
          "senator excellence",
          "senator perpetual calendar",
          "senator cosmopolite",
          "senator chronometer",
          "german marine chronometer"
        ]
      }
    ]
  },
  {
    "id": "brand_049",
    "name": "Glycine",
    "founding_snippet": "Founded in 1914 by Meylan Guerne in Bienne, Switzerland. Glycine secured immortal tool-watch status in 1953 by releasing the Airman, pioneering the multi-time-zone 24-hour dial layout that became standard issue for commercial pilots and United States military aviators during the Vietnam War.",
    "models": [
      {
        "display_name": "Airman",
        "search_aliases": [
          "airman no 1",
          "airman purist 24h",
          "airman gmt",
          "locking bezel crown",
          "vietnam war pilot",
          "vintage tool aviation"
        ]
      },
      {
        "display_name": "Combat Sub",
        "search_aliases": [
          "combat sub 42",
          "combat sub 36",
          "ultra thin dive watch",
          "automatic sellita base",
          "aquarius"
        ]
      },
      {
        "display_name": "Combat Vintage",
        "search_aliases": [
          "combat 6 classic",
          "field watch",
          "military dial classic"
        ]
      }
    ]
  },
  {
    "id": "brand_050",
    "name": "Gorilla Watches",
    "founding_snippet": "Launched in 2016 by legendary automotive and watch industrial designer Octavio Garcia (former creative head at Audemars Piguet). Based in Switzerland, the brand fuses hyper-aggressive motorsport design with unorthodox materials like layered carbon fiber, ceramic, and titanium, driven by modified wandering hour mechanics.",
    "models": [
      {
        "display_name": "Fastback",
        "search_aliases": [
          "fastback gt",
          "mirage",
          "phantom",
          "forged carbon case",
          "ceramic bezel titanium"
        ]
      },
      {
        "display_name": "Outlaw",
        "search_aliases": [
          "outlaw drift",
          "wandering hour complication",
          "vaucher movement shell",
          "retro futuristic case"
        ]
      }
    ]
  },
  {
    "id": "brand_051",
    "name": "Grand Seiko",
    "founding_snippet": "Founded in 1960 by Seiko to produce the world's most precise and beautiful mechanical watch. The manufacture represents the absolute pinnacle of Japanese horological engineering, famous for its hand-polished Zaratsu mirror finishing, 'Nature of Time' dial textures, and the unique Spring Drive movement (which merges mechanical torque with quartz precision).",
    "models": [
      {
        "display_name": "Heritage",
        "search_aliases": [
          "sbga211",
          "snowflake",
          "white birch",
          "sbgy007",
          "44gs case",
          "spring drive",
          "zaratsu polishing"
        ]
      },
      {
        "display_name": "Sport",
        "search_aliases": [
          "sbgc231",
          "spring drive chronograph gmt",
          "titanium diver",
          "sbga229"
        ]
      },
      {
        "display_name": "Elegance",
        "search_aliases": [
          "sbgy002",
          "manual wind thin dress",
          "gold case",
          "calibre 9r31"
        ]
      },
      {
        "display_name": "Evolution 9",
        "search_aliases": [
          "slgh005",
          "slga007",
          "high-beat 36000",
          "dual impulse escapement",
          "9sa5 calibre"
        ]
      }
    ]
  },
  {
    "id": "brand_052",
    "name": "Greubel Forsey",
    "founding_snippet": "Founded in 2004 by Robert Greubel and Stephen Forsey. The ultra-exclusive manufacture is globally recognized for mastering the physics of gravity compensation, having successfully integrated multi-axis tourbillons (Double Tourbillon 30°) and inclined balance wheels to achieve unrivaled chronometric performance.",
    "models": [
      {
        "display_name": "Double Tourbillon 30°",
        "search_aliases": [
          "dt30",
          "inclined tourbillon",
          "constant force"
        ]
      },
      {
        "display_name": "Quadruple Tourbillon",
        "search_aliases": [
          "four tourbillons",
          "spherical differential"
        ]
      },
      {
        "display_name": "GMT",
        "search_aliases": [
          "gmt earth",
          "rotating globe",
          "3d world time"
        ]
      },
      {
        "display_name": "Balancier",
        "search_aliases": [
          "balancier 3",
          "large inclined balance wheel",
          "hand-finished architecture"
        ]
      }
    ]
  },
  {
    "id": "brand_053",
    "name": "Grönefeld",
    "founding_snippet": "Known as the 'Horological Brothers,' Tim and Bart Grönefeld founded their independent atelier in Oldenzaal, Netherlands. They are masters of chiming complications, specifically recognized for their unique 'Remontoire' constant-force mechanisms and signature stainless-steel bridges designed to mimic Dutch bell-gables.",
    "models": [
      {
        "display_name": "1941 Remontoire",
        "search_aliases": [
          "constant force",
          "8 second remontoire",
          "stainless steel bridges",
          "1941 case"
        ]
      },
      {
        "display_name": "Parallax Tourbillon",
        "search_aliases": [
          "flying tourbillon",
          "push-to-set crown",
          "manual wind"
        ]
      },
      {
        "display_name": "Decennium",
        "search_aliases": [
          "10 year anniversary",
          "tourbillon minute repeater"
        ]
      }
    ]
  },
  {
    "id": "brand_054",
    "name": "Guinand",
    "founding_snippet": "Founded in 1865 by the Guinand family in Les Brenets, Switzerland. The brand was historically pivotal as a major manufacturer of complex chronograph and aviation flight instruments for other elite houses, eventually becoming a German-based independent brand specializing in high-utility pilot watches.",
    "models": [
      {
        "display_name": "Series 40",
        "search_aliases": [
          "40.50-03",
          "pilot chronograph",
          "valjoux 7750",
          "left-hand crown"
        ]
      },
      {
        "display_name": "Starfighter",
        "search_aliases": [
          "pilot chronograph",
          "aviation instrument"
        ]
      },
      {
        "display_name": "Flying Officer",
        "search_aliases": [
          "re-edition",
          "dual time pilot",
          "chronograph"
        ]
      }
    ]
  },
  {
    "id": "brand_055",
    "name": "Habring²",
    "founding_snippet": "Founded in 2004 in Völkermarkt, Austria, by Richard and Maria Habring. Richard Habring is the renowned inventor of the IWC Doppelchronograph (split-seconds) mechanism. Their independent workshop is famous for accessible, high-complication timepieces like Foudroyante (jumping seconds) and Doppel-chronograph modules.",
    "models": [
      {
        "display_name": "Doppel-Felix",
        "search_aliases": [
          "split-seconds chronograph",
          "monopusher",
          "in-house caliber",
          "foudroyante"
        ]
      },
      {
        "display_name": "Felix",
        "search_aliases": [
          "time only",
          "habring2 felix",
          "manual wind in-house",
          "austrian watchmaking"
        ]
      },
      {
        "display_name": "Chrono-Felix",
        "search_aliases": [
          "monopusher chronograph",
          "in-house manual wind chronograph"
        ]
      }
    ]
  },
  {
    "id": "brand_056",
    "name": "Hanhart",
    "founding_snippet": "Founded in 1882 by Johann A. Hanhart in Diessenhofen, Switzerland, the brand later moved its production to the Black Forest, Germany. Hanhart is legendary for its mid-century pilot chronographs, famously pioneering the 'red pusher' (to prevent accidental reset during timing) and high-precision mechanical stopwatch movements.",
    "models": [
      {
        "display_name": "Pioneer",
        "search_aliases": [
          "pioneer mk i",
          "pioneer mk ii",
          "monopusher chronograph",
          "red pusher",
          "flyback pilot",
          "40mm heritage"
        ]
      },
      {
        "display_name": "417 ES",
        "search_aliases": [
          "417 es 1954",
          "steve mcqueen chronograph",
          "military pilot reissue",
          "manual wind chronograph"
        ]
      },
      {
        "display_name": "Primus",
        "search_aliases": [
          "primus pilot",
          "modern aviation chronograph",
          "asymmetrical case"
        ]
      }
    ]
  },
  {
    "id": "brand_057",
    "name": "Hautlence",
    "founding_snippet": "Founded in 2004 in Neuchâtel, Switzerland. The brand operates as a creative laboratory for avant-garde horology, pushing the boundaries of time display through multi-layered, jumping-hour modules, retrograde displays, and architectural, prism-shaped case designs.",
    "models": [
      {
        "display_name": "HL",
        "search_aliases": [
          "hl classic",
          "jumping hour",
          "retrograde minutes",
          "lateral display"
        ]
      },
      {
        "display_name": "Vortex",
        "search_aliases": [
          "vortex gamma",
          "rotating escapement",
          "futuristic geometric case"
        ]
      },
      {
        "display_name": "Linear",
        "search_aliases": [
          "linear series 1",
          "linear chain movement",
          "wandering indicator"
        ]
      }
    ]
  },
  {
    "id": "brand_058",
    "name": "Hentschel Hamburg",
    "founding_snippet": "Founded in 2004 by Andreas Hentschel in Hamburg, Germany. The independent atelier specializes in hand-crafted, maritime-inspired dress watches, utilizing restored historical caliber bases to produce bespoke, low-volume pieces that prioritize traditional German finishing and navigation aesthetics.",
    "models": [
      {
        "display_name": "H1",
        "search_aliases": [
          "h1 diplomat",
          "manual wind",
          "marine chronometer style"
        ]
      },
      {
        "display_name": "H2",
        "search_aliases": [
          "h2 hafenmeister",
          "port master",
          "nautical design"
        ]
      },
      {
        "display_name": "Hamburg",
        "search_aliases": [
          "bespoke dial",
          "custom handmade watchmaking"
        ]
      }
    ]
  },
  {
    "id": "brand_059",
    "name": "Hermès",
    "founding_snippet": "Founded in Paris in 1837 as a harness and saddle maker. The house transformed into a serious horological manufacture by investing deeply in movement infrastructure (Vaucher) and enamel/dial artistry, resulting in highly poetic complications and sophisticated high-end sports watches.",
    "models": [
      {
        "display_name": "H08",
        "search_aliases": [
          "h08 titanium",
          "h08 graphene",
          "cushion case",
          "modern sports watch",
          "calibre h1837"
        ]
      },
      {
        "display_name": "Arceau",
        "search_aliases": [
          "arceau l'heure de la lune",
          "arceau le temps voyageur",
          "worldtimer moonphase",
          "asymmetric lugs"
        ]
      },
      {
        "display_name": "Cape Cod",
        "search_aliases": [
          "square-in-rectangle",
          "chain d'ancre link",
          "iconic jewelry watch"
        ]
      }
    ]
  },
  {
    "id": "brand_060",
    "name": "Horage",
    "founding_snippet": "Founded in 2009 in Biel/Bienne, Switzerland. An engineering-led brand that has successfully developed proprietary in-house calibers—including the K1 modular movement and the 'Lensman' tourbillon—with a focus on high-tech materials and performance-based value propositions.",
    "models": [
      {
        "display_name": "Supersede",
        "search_aliases": [
          "gmt",
          "integrated bracelet",
          "k2 micro-rotor",
          "flying tourbillon"
        ]
      },
      {
        "display_name": "Lensman",
        "search_aliases": [
          "flying tourbillon",
          "photography theme",
          "manual wind"
        ]
      },
      {
        "display_name": "Revolution",
        "search_aliases": [
          "k2 movement",
          "micro-rotor",
          "modular engineering"
        ]
      }
    ]
  },
  {
    "id": "brand_061",
    "name": "Hublot",
    "founding_snippet": "Founded in 1980 by Carlo Crocco in Nyon, Switzerland. Hublot revolutionized luxury watch design by being the first to pair a precious gold case with a rubber strap, and modernly anchors its identity on the 'Art of Fusion' concept, utilizing proprietary high-tech materials like Magic Gold, sapphire, and ceramic with massive manufacture chronographs.",
    "models": [
      {
        "display_name": "Big Bang",
        "search_aliases": [
          "meca-10",
          "unico",
          "integral",
          "ceramic",
          "gold",
          "chronograph",
          "porthole bezel"
        ]
      },
      {
        "display_name": "Classic Fusion",
        "search_aliases": [
          "titanium",
          "gold",
          "minimalist",
          "chronograph",
          "aerofusion"
        ]
      },
      {
        "display_name": "Spirit of Big Bang",
        "search_aliases": [
          "tonneau case",
          "skeletonized",
          "chrono",
          "ceramic"
        ]
      },
      {
        "display_name": "MP Series",
        "search_aliases": [
          "mp-09 tourbillon bi-axis",
          "mp-11 power reserve",
          "haute horlogerie",
          "futuristic architecture"
        ]
      }
    ]
  },
  {
    "id": "brand_062",
    "name": "HYT",
    "founding_snippet": "Founded in 2012 in Neuchâtel, Switzerland. HYT is a pioneer of 'hydro-mechanical' horology, engineering unique timepieces that utilize a pressurized micro-fluidic system to indicate time via the meeting point of two immiscible colored liquids inside a capillary tube.",
    "models": [
      {
        "display_name": "H0",
        "search_aliases": [
          "liquid hour",
          "minimalist",
          "fluidic"
        ]
      },
      {
        "display_name": "H1",
        "search_aliases": [
          "fluidic hours",
          "mechanical display"
        ]
      },
      {
        "display_name": "H2",
        "search_aliases": [
          "h2o",
          "bellows movement",
          "architectural bridge"
        ]
      }
    ]
  },
  {
    "id": "brand_063",
    "name": "IWC Schaffhausen",
    "founding_snippet": "Founded in 1868 by American engineer Florentine Ariosto Jones in Schaffhausen, Switzerland. IWC is globally acclaimed for its industrial precision, having established the definitive architecture for pilot watches (the Big Pilot) and high-end engineering-grade tool watches, consistently utilizing robust Pellaton winding systems.",
    "models": [
      {
        "display_name": "Pilot",
        "search_aliases": [
          "big pilot",
          "mark xx",
          "mark 20",
          "chronograph 41",
          "spitfire",
          "top gun",
          "le petit prince",
          "ceramic"
        ]
      },
      {
        "display_name": "Portugieser",
        "search_aliases": [
          "chronograph",
          "perpetual calendar",
          "annual calendar",
          "7 day",
          "manufature caliber"
        ]
      },
      {
        "display_name": "Ingenieur",
        "search_aliases": [
          "gérald genta",
          "integrated bracelet",
          "sports watch",
          "anti-magnetic"
        ]
      },
      {
        "display_name": "Portofino",
        "search_aliases": [
          "dress watch",
          "minimalist",
          "automatic"
        ]
      }
    ]
  },
  {
    "id": "brand_064",
    "name": "Jaeger-LeCoultre",
    "founding_snippet": "Founded in 1833 by Antoine LeCoultre in Le Sentier, Switzerland. Known as the 'Watchmaker's Watchmaker' for historically supplying calibers to the industry's most prestigious houses, JLC is a vertical manufacture legendary for its incredibly wide breadth of expertise, from the rotating Reverso case to complex minute repeaters and Atmos clocks.",
    "models": [
      {
        "display_name": "Reverso",
        "search_aliases": [
          "tribute",
          "duoface",
          "monoface",
          "art deco",
          "rotating case",
          "small seconds"
        ]
      },
      {
        "display_name": "Master",
        "search_aliases": [
          "master control date",
          "master calendar",
          "master geographic",
          "ultra thin moon"
        ]
      },
      {
        "display_name": "Polaris",
        "search_aliases": [
          "memovox",
          "diver",
          "sports watch",
          "chronograph"
        ]
      },
      {
        "display_name": "Gyrotourbillon",
        "search_aliases": [
          "multi-axis tourbillon",
          "haute horlogerie",
          "complication"
        ]
      }
    ]
  },
  {
    "id": "brand_065",
    "name": "Jean-Claude Biver (Biver / Biver Watches)",
    "founding_snippet": "The ultra-exclusive independent manufacture launched in 2023 by legendary industry visionary Jean-Claude Biver and his son, Pierre. The brand focuses on creating hyper-limited, high-art, and complex timepieces—such as tourbillon carillons—that blend traditional hand-finishing with modern materials and a deeply personal collector ethos.",
    "models": [
      {
        "display_name": "Carillon Tourbillon",
        "search_aliases": [
          "biver carillon",
          "tourbillon",
          "minute repeater",
          "hand-finished",
          "gold rotor"
        ]
      }
    ]
  },
  {
    "id": "brand_066",
    "name": "Jean-François Mojon (Chronode / Collaborations)",
    "founding_snippet": "Founded in 2005 in Le Locle, Switzerland. An elite horological engineering bureau led by visionary movement designer Jean-François Mojon, responsible for creating the most avant-garde, boundary-pushing movement architectures for brands like MB&F, Harry Winston, and Cyrus.",
    "models": [
      {
        "display_name": "Movement Engines",
        "search_aliases": [
          "bespoke caliber",
          "complication module",
          "collaborative engineering"
        ]
      }
    ]
  },
  {
    "id": "brand_067",
    "name": "Kari Voutilainen",
    "founding_snippet": "Operating his independent workshop in Môtiers, Switzerland, Kari Voutilainen is one of the most respected independent watchmakers in history. He is universally acclaimed for his peerless, hyper-traditional hand-guilloché dials, perfectly sculpted hands, and uniquely developed, highly efficient movement architectures.",
    "models": [
      {
        "display_name": "Vingt-8",
        "search_aliases": [
          "vingt 8",
          "in-house manual wind",
          "proprietary escapement",
          "hand-guilloché",
          "observatory grade finishing"
        ]
      },
      {
        "display_name": "GMT-6",
        "search_aliases": [
          "gmt 6",
          "gmt complication",
          "disk indicator",
          "manual wind"
        ]
      },
      {
        "display_name": "28SC",
        "search_aliases": [
          "28 sc",
          "seconds center",
          "classic dress"
        ]
      },
      {
        "display_name": "Tourbillon",
        "search_aliases": [
          "voutilainen tourbillon",
          "bespoke high-horology"
        ]
      }
    ]
  },
  {
    "id": "brand_068",
    "name": "Krayon",
    "founding_snippet": "Founded in Neuchâtel by engineer Rémi Maillat. The independent brand achieved international acclaim for engineering the 'Everywhere' complication, a mechanical calculation engine that precisely tracks sunrise and sunset times based on any global coordinate and date selected by the user.",
    "models": [
      {
        "display_name": "Everywhere",
        "search_aliases": [
          "everywhere horizon",
          "sunrise sunset tracker",
          "mechanical longitude latitude calculation",
          "universal complication"
        ]
      },
      {
        "display_name": "Anywhere",
        "search_aliases": [
          "anywhere watch",
          "day night disk",
          "24 hour display",
          "manual mechanical complication"
        ]
      }
    ]
  },
  {
    "id": "brand_069",
    "name": "Kurono Tokyo",
    "founding_snippet": "Founded by legendary Japanese watchmaker Hajime Asaoka. Kurono Tokyo serves as his more accessible, design-focused label, blending modern mass-production techniques with Asaoka's distinctive Art Deco-inspired Japanese dial aesthetics and color palettes.",
    "models": [
      {
        "display_name": "Chronograph",
        "search_aliases": [
          "1th",
          "2th",
          "3th",
          "panda",
          "monopusher",
          "retro racing"
        ]
      },
      {
        "display_name": "Toki",
        "search_aliases": [
          "toki sunset dial",
          "classic three hand",
          "miyota premium"
        ]
      },
      {
        "display_name": "Seiji",
        "search_aliases": [
          "seiji porcelain blue",
          "minimalist dress"
        ]
      }
    ]
  },
  {
    "id": "brand_070",
    "name": "La Joux-Perret",
    "founding_snippet": "A premier Swiss movement manufacturer located in La Chaux-de-Fonds. While primarily known for supplying high-end mechanical movements and chronograph modules to various independent brands, they also produce high-end watches under their own label, showcasing high-frequency chronographs and artistic complications.",
    "models": [
      {
        "display_name": "Chronograph",
        "search_aliases": [
          "calibre g100",
          "g100 movement",
          "in-house high frequency"
        ]
      }
    ]
  },
  {
    "id": "brand_071",
    "name": "Lang & Heyne",
    "founding_snippet": "Founded in 2001 in Dresden, Germany, by Marco Lang and Mirko Heyne. The manufacture is an elite practitioner of Saxon horology, famous for its distinct, skeletonized Calibre I movement architecture, featuring three-quarter plates and elegant, hand-polished components that evoke the grandeur of 19th-century chronometry.",
    "models": [
      {
        "display_name": "Anton",
        "search_aliases": [
          "single pusher chronograph",
          "calibre I",
          "saxon caliber",
          "white enamel dial"
        ]
      },
      {
        "display_name": "Albert",
        "search_aliases": [
          "jumping numerals",
          "jump hour",
          "calibre VI"
        ]
      },
      {
        "display_name": "Hektor",
        "search_aliases": [
          "hektor manual wind",
          "calibre V",
          "sub seconds"
        ]
      },
      {
        "display_name": "Konrad",
        "search_aliases": [
          "konrad jumping seconds",
          "manual wind dress"
        ]
      }
    ]
  },
  {
    "id": "brand_072",
    "name": "Laurent Ferrier",
    "founding_snippet": "Founded in 2008 by former Patek Philippe creative director Laurent Ferrier. The independent manufacture is universally acclaimed for its master-class hand-finishing, uniquely elegant 'Galet' (pebble) case shapes, and highly proprietary movements like the natural escapement (double direct-impulse).",
    "models": [
      {
        "display_name": "Galet Classic",
        "search_aliases": [
          "galet tourbillon",
          "double direct impulse",
          "micro-rotor",
          "pebble case",
          "grand feu enamel"
        ]
      },
      {
        "display_name": "Sport Auto",
        "search_aliases": [
          "integrated titanium",
          "sport auto 40",
          "micro-rotor automatic",
          "fumé dial"
        ]
      },
      {
        "display_name": "Classic Micro-Rotor",
        "search_aliases": [
          "classic mr",
          "sector dial",
          "pebble case manual"
        ]
      }
    ]
  },
  {
    "id": "brand_073",
    "name": "Le Forban",
    "founding_snippet": "Founded in 1969 in Paris, France. Historically recognized as the official supplier of dive watches to the French Navy (Marine Nationale), the brand was revived to produce faithful, robust, and accessibly priced military-style skin divers.",
    "models": [
      {
        "display_name": "Malouine",
        "search_aliases": [
          "skin diver",
          "miyota automatic",
          "vintage military"
        ]
      },
      {
        "display_name": "Brestois",
        "search_aliases": [
          "brestois diver",
          "42mm professional",
          "marine nationale tool watch"
        ]
      }
    ]
  },
  {
    "id": "brand_074",
    "name": "Lemania",
    "founding_snippet": "Historically founded in 1884 by Alfred Lugrin in L'Orient, Switzerland. Lemania was the definitive powerhouse of chronograph movement development, famously crafting the caliber 321 (for the Speedmaster) and the caliber 5100 (for military aviation), before being absorbed into Breguet's manufacture infrastructure.",
    "models": [
      {
        "display_name": "Chronograph Calibers",
        "search_aliases": [
          "cal 321",
          "cal 5100",
          "cal 1873",
          "vintage chronograph movement"
        ]
      }
    ]
  },
  {
    "id": "brand_075",
    "name": "Linde Werdelin",
    "founding_snippet": "Founded in 2002 by Jorn Werdelin and Morten Linde. Based in Denmark/Switzerland, the brand creates aggressive, angular sports watches designed specifically for high-intensity professional skiing and diving, often paired with proprietary digital 'Instrument' snap-on modules.",
    "models": [
      {
        "display_name": "Oktopus",
        "search_aliases": [
          "oktopus moonphase",
          "skeletonized diver",
          "titanium case"
        ]
      },
      {
        "display_name": "Spido",
        "search_aliases": [
          "spido speed",
          "spidolite",
          "skeletonized chronograph",
          "avant-garde sports"
        ]
      }
    ]
  },
  {
    "id": "brand_076",
    "name": "Louis Erard",
    "founding_snippet": "Founded in 1929 in La Chaux-de-Fonds, Switzerland. The independent maison has undergone a brilliant transformation in recent years, pivoting from traditional designs to high-concept collaborations with master watchmakers and designers (like Alain Silberstein and Vianney Halter), focusing on artistic regulator dials and accessible avant-garde aesthetics.",
    "models": [
      {
        "display_name": "Regulateur",
        "search_aliases": [
          "regulator silberstein",
          "le classique",
          "le créateur",
          "triptych",
          "asymmetrical dial"
        ]
      },
      {
        "display_name": "Excellence",
        "search_aliases": [
          "excellence triptych",
          "manual wind",
          "small seconds",
          "minimalist"
        ]
      },
      {
        "display_name": "Sport",
        "search_aliases": [
          "sport heritage",
          "chronograph",
          "integrated design"
        ]
      }
    ]
  },
  {
    "id": "brand_077",
    "name": "Louis Moinet",
    "founding_snippet": "Founded in 2004 in Saint-Blaise, Switzerland, in honor of Louis Moinet (1768–1853), the inventor of the chronograph. The brand creates hyper-exclusive, haute horlogerie timepieces that often integrate rare materials like authentic meteorite fragments, dinosaur bones, and fossilized palm wood into high-complication tourbillon movements.",
    "models": [
      {
        "display_name": "Compteur de Tierces",
        "search_aliases": [
          "memento",
          "first chronograph",
          "historical tribute"
        ]
      },
      {
        "display_name": "Space Revolution",
        "search_aliases": [
          "double tourbillon",
          "satellite tourbillon",
          "spaceship design"
        ]
      },
      {
        "display_name": "Memoris",
        "search_aliases": [
          "chronograph on the dial",
          "column wheel",
          "openworked movement"
        ]
      }
    ]
  },
  {
    "id": "brand_078",
    "name": "Louis Vuitton (La Fabrique du Temps)",
    "founding_snippet": "While globally recognized as a luxury fashion house, Louis Vuitton established 'La Fabrique du Temps' in Geneva, an elite manufacture led by masters Michel Navas and Enrico Barbasini. They craft hyper-complex, award-winning timepieces featuring intricate automatons, tourbillons, and minute repeaters.",
    "models": [
      {
        "display_name": "Tambour",
        "search_aliases": [
          "tambour jacquemarts",
          "tambour spin time",
          "drum case",
          "tambour twenty",
          "tambour gmt"
        ]
      },
      {
        "display_name": "Voyager",
        "search_aliases": [
          "voyager flying tourbillon",
          "puncq case",
          "haute horlogerie"
        ]
      },
      {
        "display_name": "Escale",
        "search_aliases": [
          "worldtime",
          "hand-painted dial",
          "traveler complication"
        ]
      }
    ]
  },
  {
    "id": "brand_079",
    "name": "Lüm-Tec",
    "founding_snippet": "Founded in 2008 by Chris Wiegand in Ohio, USA. The brand specializes in rugged, high-visibility tool watches, renowned for their proprietary 'MDV' (Maximum Darkness Visibility) luminous technology, which involves multi-layer application of grade X1 Super-LumiNova for extreme glow intensity.",
    "models": [
      {
        "display_name": "Combat",
        "search_aliases": [
          "combat b",
          "combat field",
          "sandblasted case",
          "tritium alternatives"
        ]
      },
      {
        "display_name": "M Series",
        "search_aliases": [
          "m automatic",
          "chronograph",
          "rugged tool watch"
        ]
      },
      {
        "display_name": "V Series",
        "search_aliases": [
          "v automatic",
          "cushion case",
          "sport watch"
        ]
      }
    ]
  },
  {
    "id": "brand_080",
    "name": "Lundis Bleus",
    "founding_snippet": "Founded in 2016 by Johan Gimenez and Bastien Vuilliomenet in La Chaux-de-Fonds, Switzerland. The small independent studio creates poetic, highly artistic timepieces, focusing on custom 'Grand Feu' enamel dials and unconventional aesthetic displays, often incorporating planetary or artistic motifs.",
    "models": [
      {
        "display_name": "Enamel Series",
        "search_aliases": [
          "grand feu enamel",
          "bespoke artisan dial",
          "independent Swiss"
        ]
      },
      {
        "display_name": "Custom",
        "search_aliases": [
          "bespoke order",
          "independent atelier",
          "artistic complications"
        ]
      }
    ]
  },
  {
    "id": "brand_081",
    "name": "Maison Alcée",
    "founding_snippet": "Founded in 2023 by Alcée Montfort in France. This innovative manufacture focuses on 'horological objects' rather than standard watches, specifically creating high-end, DIY-assembly mechanical clock kits that allow enthusiasts to build their own professional-grade desk clocks with traditional finishing.",
    "models": [
      {
        "display_name": "Persée",
        "search_aliases": [
          "diy clock",
          "horological object",
          "table clock assembly",
          "mechanical kit"
        ]
      }
    ]
  },
  {
    "id": "brand_082",
    "name": "Manufacture Royale",
    "founding_snippet": "Originally founded in 1770 by Voltaire, the brand was revived in 2010. The independent manufacture is known for its highly theatrical, avant-garde designs and mechanical complexity, featuring bold case structures and large-scale tourbillon movements.",
    "models": [
      {
        "display_name": "1770",
        "search_aliases": [
          "voltige",
          "micro-rotor",
          "flying tourbillon",
          "avant-garde"
        ]
      },
      {
        "display_name": "Androgyne",
        "search_aliases": [
          "skeletonized",
          "tourbillon",
          "geometric case"
        ]
      }
    ]
  },
  {
    "id": "brand_083",
    "name": "Marloe Watch Company",
    "founding_snippet": "Founded in 2015 by Oliver Goffe and Gordon Fraser in the UK. Marloe focuses on design-led, narrative-driven watches, utilizing manual-wind movements to encourage a tactile connection between the owner and the mechanical heartbeat of their timepieces.",
    "models": [
      {
        "display_name": "Solent",
        "search_aliases": [
          "maritime",
          "chronograph",
          "regatta",
          "manual wind"
        ]
      },
      {
        "display_name": "Coniston",
        "search_aliases": [
          "field watch",
          "british design",
          "vintage aesthetic"
        ]
      },
      {
        "display_name": "Morar",
        "search_aliases": [
          "dive watch",
          "decompressing case",
          "high-depth rating"
        ]
      }
    ]
  },
  {
    "id": "brand_084",
    "name": "Maurice Lacroix",
    "founding_snippet": "Founded in 1975 in Saignelégier, Switzerland. The brand became a modern icon of accessible luxury by dominating the integrated-bracelet sports watch segment with the AIKON, while also maintaining a serious technical reputation for its 'Masterpiece' line of in-house complications like retrograde displays and square wheels.",
    "models": [
      {
        "display_name": "Aikon",
        "search_aliases": [
          "aikon automatic",
          "aikon chronograph",
          "integrated bracelet",
          "clous de paris",
          "gmt",
          "skeleton"
        ]
      },
      {
        "display_name": "Masterpiece",
        "search_aliases": [
          "square wheel",
          "retrograde",
          "mystery seconds",
          "in-house complication"
        ]
      },
      {
        "display_name": "Pontos",
        "search_aliases": [
          "pontos day date",
          "chronograph",
          "classic sport"
        ]
      }
    ]
  },
  {
    "id": "brand_085",
    "name": "MB&F (Maximilian Büsser & Friends)",
    "founding_snippet": "Founded in 2005 by Maximilian Büsser. MB&F is not a traditional watch brand, but a creative laboratory that collaborates with elite independent watchmakers ('Friends') to create three-dimensional 'Horological Machines' and 'Legacy Machines' that defy traditional watchmaking norms.",
    "models": [
      {
        "display_name": "Horological Machines",
        "search_aliases": [
          "hm3",
          "hm4",
          "hm6",
          "hm9",
          "space pirate",
          "futuristic architecture",
          "fluidic power"
        ]
      },
      {
        "display_name": "Legacy Machines",
        "search_aliases": [
          "lm1",
          "lm2",
          "lm split escapement",
          "flying balance wheel",
          "traditional reimagined"
        ]
      },
      {
        "display_name": "M.A.D.1",
        "search_aliases": [
          "mad1",
          "mad edition",
          "spinning rotor time display",
          "entry-level experiment"
        ]
      }
    ]
  },
  {
    "id": "brand_086",
    "name": "Maîtres du Temps",
    "founding_snippet": "Founded in 2005 by Steven Holtzman. The brand pioneered a 'collaborative' model of watchmaking, inviting legendary independent masters like Roger Dubuis, Peter Speake-Marin, and Christophe Claret to design unique, high-complication timepieces under a single brand identity.",
    "models": [
      {
        "display_name": "Chapter One",
        "search_aliases": [
          "tourbillon",
          "monopusher chronograph",
          "retrograde date",
          "moon phase",
          "roller display"
        ]
      },
      {
        "display_name": "Chapter Two",
        "search_aliases": [
          "triple calendar",
          "roller month day",
          "large date"
        ]
      },
      {
        "display_name": "Chapter Three",
        "search_aliases": [
          "reveal hidden display",
          "jump hour",
          "mysterious aperture"
        ]
      }
    ]
  },
  {
    "id": "brand_087",
    "name": "Marathon Watch Company",
    "founding_snippet": "Founded in 1939 by Morris Wein and currently based in Canada. Marathon has been a long-term contract supplier of precision timepieces for the U.S. military and Canadian forces, specializing in ultra-rugged, Tritium-illuminated 'Search and Rescue' (SAR) divers and pilot watches.",
    "models": [
      {
        "display_name": "GSAR",
        "search_aliases": [
          "government search and rescue",
          "tritium gas tubes",
          "300m diver",
          "stainess steel tool watch"
        ]
      },
      {
        "display_name": "Navigator",
        "search_aliases": [
          "pilot watch",
          "composite case",
          "asymmetric lug design",
          "military issue"
        ]
      },
      {
        "display_name": "JDD",
        "search_aliases": [
          "jumbo day date",
          "automatic diver",
          "46mm"
        ]
      }
    ]
  },
  {
    "id": "brand_088",
    "name": "MeisterSinger",
    "founding_snippet": "Founded in 2001 in Münster, Germany, by Manfred Brassler. The brand is globally recognized for its philosophy of 'slow watchmaking,' using a signature single-hand dial layout to represent the passage of time, encouraging wearers to focus on the duration rather than the precise second.",
    "models": [
      {
        "display_name": "No. 01",
        "search_aliases": [
          "single hand",
          "manual wind",
          "minimalist classic"
        ]
      },
      {
        "display_name": "Singularis",
        "search_aliases": [
          "in-house caliber",
          "single hand",
          "luxury dress watch"
        ]
      },
      {
        "display_name": "Circularis",
        "search_aliases": [
          "circularis automatic",
          "extended power reserve",
          "high-end single hand"
        ]
      }
    ]
  },
  {
    "id": "brand_089",
    "name": "Memorigin",
    "founding_snippet": "Founded in Hong Kong in 2011. It is a high-end tourbillon manufacturer that blends traditional Swiss-inspired technical watchmaking with distinctively Eastern artistic motifs, such as Chinese zodiac themes, paper-cutting art, and intricate enamel work.",
    "models": [
      {
        "display_name": "Zodiac Series",
        "search_aliases": [
          "tourbillon",
          "chinese zodiac",
          "engraved movement"
        ]
      },
      {
        "display_name": "Art Series",
        "search_aliases": [
          "paper cutting",
          "enamel tourbillon",
          "bespoke artisan"
        ]
      }
    ]
  },
  {
    "id": "brand_090",
    "name": "Ming",
    "founding_snippet": "Founded in 2017 by Ming Thein and a group of enthusiasts. Operating as a design-first independent studio, Ming redefined modern accessible luxury by emphasizing proprietary geometric dial layering, distinctive lug profiles, and minimalist yet highly technical horological design.",
    "models": [
      {
        "display_name": "17.09",
        "search_aliases": [
          "blue dial",
          "independent design",
          "sector dial"
        ]
      },
      {
        "display_name": "22.01",
        "search_aliases": [
          "gmt",
          "monopusher",
          "geometric architecture"
        ]
      },
      {
        "display_name": "37.07",
        "search_aliases": [
          "anniversary watch",
          "mosaic dial",
          "independent hallmark"
        ]
      }
    ]
  },
  {
    "id": "brand_091",
    "name": "MING x Jean Rosselet",
    "founding_snippet": "A specialized technical intersection focusing on the extreme high-horology manifestations of the MING design language, specifically integrating complex, independent-grade movement architecture with the brand's signature geometric aesthetic.",
    "models": [
      {
        "display_name": "LW.01",
        "search_aliases": [
          "manual wind",
          "ultra-thin",
          "independent movement",
          "minimalist"
        ]
      }
    ]
  },
  {
    "id": "brand_092",
    "name": "Minase",
    "founding_snippet": "Founded in 2005 in Akita, Japan. Minase is famed for its 'Case-in-Case' (MORE) construction, a modular architecture that allows for mirror-polishing of internal surfaces (Zaratsu) that are inaccessible on traditional watches, resulting in jewel-like depth and brilliance.",
    "models": [
      {
        "display_name": "Horizon",
        "search_aliases": [
          "horizontal construction",
          "zaratsu polishing",
          "in-house case modularity"
        ]
      },
      {
        "display_name": "Divido",
        "search_aliases": [
          "open-work",
          "modular case",
          "japanese steel craft"
        ]
      },
      {
        "display_name": "5 Windows",
        "search_aliases": [
          "five windows",
          "sapphire casing",
          "movement display"
        ]
      }
    ]
  },
  {
    "id": "brand_093",
    "name": "Montblanc",
    "founding_snippet": "While historically a writing instrument maison, Montblanc transformed into a serious horological powerhouse by acquiring the historic Minerva manufacture in Villeret. They now produce some of the most respected high-frequency chronographs and vintage-inspired pilot watches in the industry.",
    "models": [
      {
        "display_name": "1858",
        "search_aliases": [
          "geosphere",
          "monopusher chronograph",
          "vintage pilot",
          "mountain exploration"
        ]
      },
      {
        "display_name": "Minerva Heritage",
        "search_aliases": [
          "pulsemeter",
          "pythagore",
          "chronograph",
          "hand-finished caliber"
        ]
      },
      {
        "display_name": "Star Legacy",
        "search_aliases": [
          "moonphase",
          "full calendar",
          "classical dress"
        ]
      }
    ]
  },
  {
    "id": "brand_094",
    "name": "Moser & Cie (H. Moser & Cie.)",
    "founding_snippet": "Founded in 1828 by Heinrich Moser. The modern manufacture is famous for its 'minimalist luxury' approach, creating high-horology pieces with no logos or indices (Concept series), proprietary hairsprings, and arguably the most iconic 'fumé' (smoky) dials in the world.",
    "models": [
      {
        "display_name": "Endeavour",
        "search_aliases": [
          "concept",
          "fumé dial",
          "tourbillon",
          "perpetual calendar",
          "funky blue"
        ]
      },
      {
        "display_name": "Pioneer",
        "search_aliases": [
          "pioneer center seconds",
          "pioneer perpetual",
          "luxury sport",
          "adventure"
        ]
      },
      {
        "display_name": "Streamliner",
        "search_aliases": [
          "integrated bracelet",
          "flyback chronograph",
          "cushion case",
          "green dial"
        ]
      },
      {
        "display_name": "Swiss Alp",
        "search_aliases": [
          "smartwatch parody",
          "mechanical movement",
          "pixel display"
        ]
      }
    ]
  },
  {
    "id": "brand_095",
    "name": "Movado",
    "founding_snippet": "Founded in 1881 in La Chaux-de-Fonds, Switzerland. Movado is internationally recognized for the 'Museum Watch,' a design icon featuring a single dot at 12 o'clock (representing the sun at high noon), reflecting the mid-century Bauhaus influence.",
    "models": [
      {
        "display_name": "Museum",
        "search_aliases": [
          "dot dial",
          "bauhaus design",
          "minimalist"
        ]
      },
      {
        "display_name": "Heritage",
        "search_aliases": [
          "chronograph",
          "vintage revival"
        ]
      }
    ]
  },
  {
    "id": "brand_096",
    "name": "Mühle Glashütte",
    "founding_snippet": "Founded in 1869 by Robert Mühle in Glashütte, Germany. Currently the only watch manufacturer in Glashütte still owned by a long-established local family, Mühle specializes in precision 'nautical instruments'—highly legible, robust tool watches built to withstand the harshest land, sea, and air conditions.",
    "models": [
      {
        "display_name": "ProMare",
        "search_aliases": [
          "promare go",
          "promare datum",
          "nautical tool watch",
          "300m diver"
        ]
      },
      {
        "display_name": "29er",
        "search_aliases": [
          "29er big",
          "29er casual",
          "sport automatic",
          "sailing inspired"
        ]
      },
      {
        "display_name": "Teutonia",
        "search_aliases": [
          "teutonia sport",
          "chronograph",
          "classical german design"
        ]
      },
      {
        "display_name": "Terrasport",
        "search_aliases": [
          "flieger",
          "pilot watch",
          "military style"
        ]
      }
    ]
  },
  {
    "id": "brand_097",
    "name": "Monta",
    "founding_snippet": "Launched in 2016 in St. Louis, Missouri. Monta is a highly regarded modern microbrand that bridges the gap between independent design and Swiss-made quality. They are best known for their 'Skyquest' GMT and 'Oceanking' diver, which feature exceptional finishing and case ergonomics comparable to established luxury houses.",
    "models": [
      {
        "display_name": "Skyquest",
        "search_aliases": [
          "gmt",
          "bi-color bezel",
          "traveler watch",
          "swiss-made sport"
        ]
      },
      {
        "display_name": "Oceanking",
        "search_aliases": [
          "diver",
          "ceramic bezel",
          "300m",
          "professional diver"
        ]
      },
      {
        "display_name": "Noble",
        "search_aliases": [
          "everyday sports",
          "minimalist dress",
          "gilt dial"
        ]
      },
      {
        "display_name": "Triumph",
        "search_aliases": [
          "field watch",
          "everyday tool watch",
          "clean dial"
        ]
      }
    ]
  },
  {
    "id": "brand_098",
    "name": "Mondaine",
    "founding_snippet": "Founded in 1951 by Erwin Bernheim. Mondaine is globally recognized as the 'Official Swiss Railways Watch' brand, featuring the iconic design of the station clock with its distinctive red-tipped lollipop second hand that pauses momentarily at the 12 o'clock mark.",
    "models": [
      {
        "display_name": "Official Swiss Railways",
        "search_aliases": [
          "stop2go",
          "classic station clock",
          "bauhaus design",
          "minimalist"
        ]
      },
      {
        "display_name": "Helvetica",
        "search_aliases": [
          "helvetica light",
          "helvetica bold",
          "typographic design",
          "modernist"
        ]
      }
    ]
  },
  {
    "id": "brand_099",
    "name": "Montres de Souscription (MDS)",
    "founding_snippet": "A boutique studio focused on the 'subscription' model of watchmaking—a tribute to the 18th-century practice where collectors would fund the creation of a watch upfront in exchange for a unique, limited-production timepiece directly from the maker.",
    "models": [
      {
        "display_name": "MDS1",
        "search_aliases": [
          "subscription model",
          "independent production",
          "limited edition"
        ]
      }
    ]
  },
  {
    "id": "brand_100",
    "name": "Moritz Grossmann",
    "founding_snippet": "Founded in 2008 by Christine Hutter in Glashütte, Germany. Named after the 19th-century pioneer of the Glashütte watch industry, the brand is renowned for its proprietary, highly innovative movement designs, including a unique pusher-operated crown system and exceptionally long, hand-finished gold hands.",
    "models": [
      {
        "display_name": "Benu",
        "search_aliases": [
          "benu tourbillon",
          "manual wind",
          "saxon high-horology",
          "pusher crown",
          "glashütte gold hands"
        ]
      },
      {
        "display_name": "Hamatic",
        "search_aliases": [
          "hammer automatic",
          "vintage winding system",
          "saxon movement"
        ]
      },
      {
        "display_name": "Tremblage",
        "search_aliases": [
          "hand-engraved dial",
          "artistic finish",
          "independent german"
        ]
      }
    ]
  },
  {
    "id": "brand_101",
    "name": "Nivada Grenchen",
    "founding_snippet": "Originally founded in 1926 in Grenchen, Switzerland. Historically celebrated for its mid-century tool watch innovation—particularly the Chronomaster Aviator Sea Diver and the Antarctic (issued to Operation Deep Freeze explorers)—the brand was brilliantly revived in 2018 to produce faithful, modernized re-issues of its legendary archives.",
    "models": [
      {
        "display_name": "Chronomaster",
        "search_aliases": [
          "aviator sea diver",
          "casd",
          "valjoux 72",
          "chronograph",
          "vintage pilot diver",
          "panda dial"
        ]
      },
      {
        "display_name": "Antarctic",
        "search_aliases": [
          "antarctic diver",
          "explorer watch",
          "spider dial",
          "vintage reissue",
          "36mm"
        ]
      },
      {
        "display_name": "Depthmaster",
        "search_aliases": [
          "pac-man dial",
          "1000m diver",
          "vintage skin diver",
          "cushion case"
        ]
      }
    ]
  },
  {
    "id": "brand_102",
    "name": "Nomos Glashütte",
    "founding_snippet": "Founded in 1990 by Roland Schwertner shortly after German reunification. Nomos is a fully integrated manufacture that brought the Bauhaus design philosophy into the modern era, pairing minimalist, high-typography aesthetics with in-house escapements (the 'Swing System') at accessible price points.",
    "models": [
      {
        "display_name": "Tangente",
        "search_aliases": [
          "bauhaus",
          "minimalist",
          "manual wind",
          "small seconds",
          "beta movement"
        ]
      },
      {
        "display_name": "Club",
        "search_aliases": [
          "club sport neomatik",
          "everyday sports",
          "1000ft",
          "glashütte automatic"
        ]
      },
      {
        "display_name": "Metro",
        "search_aliases": [
          "date power reserve",
          "mark braun design",
          "urban modernist"
        ]
      },
      {
        "display_name": "Lambda",
        "search_aliases": [
          "high-horology",
          "72 hour power reserve",
          "gold case",
          "luxury dress"
        ]
      }
    ]
  },
  {
    "id": "brand_103",
    "name": "Norqain",
    "founding_snippet": "Founded in 2018 in Nidau, Switzerland, by the Kuffer family. A modern, family-owned independent brand that builds robust, high-performance sports watches, often collaborating with movement specialist Kenissi to utilize high-end, long-power-reserve manufacture calibers.",
    "models": [
      {
        "display_name": "Freedom",
        "search_aliases": [
          "60s vintage",
          "chronograph",
          "retro sport"
        ]
      },
      {
        "display_name": "Neverest",
        "search_aliases": [
          "gmt",
          "chronometer",
          "high-performance sport",
          "mountaineering"
        ]
      },
      {
        "display_name": "Wild One",
        "search_aliases": [
          "norteq",
          "ultra-lightweight",
          "shock-absorbent",
          "carbon"
        ]
      }
    ]
  },
  {
    "id": "brand_104",
    "name": "Ochs und Junior",
    "founding_snippet": "Founded in 2006 by Ludwig Oechslin, Beat Weinmann, and Kurt Klaus in Lucerne, Switzerland. Oechslin is the visionary horologist responsible for the Ulysse Nardin Perpetual Calendar. The brand focuses on extreme reductionist engineering, using the minimum number of parts possible to create complex astronomical and time-keeping functions.",
    "models": [
      {
        "display_name": "Annual Calendar",
        "search_aliases": [
          "minimalist calendar",
          "date display",
          "geometrical complication"
        ]
      },
      {
        "display_name": "Moon Phase",
        "search_aliases": [
          "astronomical complication",
          "precision moon",
          "reductionist dial"
        ]
      },
      {
        "display_name": "Settimana",
        "search_aliases": [
          "weekly indicator",
          "minimalist design"
        ]
      }
    ]
  },
  {
    "id": "brand_105",
    "name": "Omega",
    "founding_snippet": "Founded in 1848 by Louis Brandt in La Chaux-de-Fonds. As one of the world's most influential manufacturers, Omega is defined by its pivotal roles in space exploration (the Speedmaster 'Moonwatch'), professional diving (Seamaster), and its technical mastery of co-axial escapements and METAS-certified anti-magnetic resistance.",
    "models": [
      {
        "display_name": "Speedmaster",
        "search_aliases": [
          "moonwatch",
          "professional",
          "cal 3861",
          "cal 321",
          "dark side of the moon",
          "racing",
          "chronograph"
        ]
      },
      {
        "display_name": "Seamaster",
        "search_aliases": [
          "diver 300m",
          "planet ocean",
          "aqua terra",
          "heritage diver",
          "300",
          "gmt"
        ]
      },
      {
        "display_name": "Constellation",
        "search_aliases": [
          "globemaster",
          "pie pan",
          "integrated dress",
          "metas master chronometer"
        ]
      },
      {
        "display_name": "De Ville",
        "search_aliases": [
          "trésor",
          "ladymatic",
          "classical dress",
          "co-axial"
        ]
      }
    ]
  },
  {
    "id": "brand_106",
    "name": "Oris",
    "founding_snippet": "Founded in 1904 in Hölstein, Switzerland. An iconic independent manufacture celebrated for its 'Go Your Own Way' philosophy. Oris is highly respected for producing robust, high-value mechanical tool watches and consistently innovating with in-house movements, such as the high-power-reserve Calibre 400 series.",
    "models": [
      {
        "display_name": "Divers Sixty-Five",
        "search_aliases": [
          "diver 65",
          "vintage diver reissue",
          "bronze bezel",
          "retro style"
        ]
      },
      {
        "display_name": "Aquis",
        "search_aliases": [
          "aquis date",
          "aquis cal 400",
          "professional diver",
          "ceramic bezel",
          "300m"
        ]
      },
      {
        "display_name": "Big Crown",
        "search_aliases": [
          "pointer date",
          "pro-pilot",
          "aviation watch",
          "vintage pilot"
        ]
      },
      {
        "display_name": "Propilot X",
        "search_aliases": [
          "calibre 400",
          "titanium",
          "integrated design",
          "avant-garde"
        ]
      }
    ]
  },
  {
    "id": "brand_107",
    "name": "Oscillon",
    "founding_snippet": "Founded by Dominique Buser and Cyrill Brutschin. This ultra-exclusive, low-volume independent workshop is dedicated to the 'hand-made' philosophy, where every single component of their intricate, tourbillon-equipped watches is fabricated and finished by hand, utilizing no CNC machining.",
    "models": [
      {
        "display_name": "jkd",
        "search_aliases": [
          "tourbillon",
          "hand-made",
          "independent horology",
          "traditional finish"
        ]
      }
    ]
  },
  {
    "id": "brand_108",
    "name": "Patek Philippe",
    "founding_snippet": "Founded in 1839 in Geneva. Widely considered the pinnacle of traditional Swiss watchmaking, Patek Philippe is the standard-bearer for elite grand complications, perpetual calendars, and high-end sports watches, governed by the stringent Patek Philippe Seal of quality.",
    "models": [
      {
        "display_name": "Calatrava",
        "search_aliases": [
          "5227",
          "6119",
          "hobnail bezel",
          "classic dress",
          "manual wind"
        ]
      },
      {
        "display_name": "Nautilus",
        "search_aliases": [
          "5711",
          "5811",
          "5712",
          "integrated sports",
          "gérald genta",
          "luxury sport"
        ]
      },
      {
        "display_name": "Aquanaut",
        "search_aliases": [
          "5167",
          "5168",
          "travel time",
          "tropical strap",
          "modern sport"
        ]
      },
      {
        "display_name": "Grand Complications",
        "search_aliases": [
          "perpetual calendar",
          "minute repeater",
          "chronograph",
          "split seconds",
          "5270"
        ]
      }
    ]
  },
  {
    "id": "brand_109",
    "name": "Parmigiani Fleurier",
    "founding_snippet": "Founded in 1996 in Fleurier, Switzerland, by master restorer Michel Parmigiani. Backed by the Sandoz Family Foundation, the manufacture is uniquely positioned to produce hyper-refined, under-the-radar luxury timepieces, famous for their integrated Tonda sports watches and traditional haute horlogerie finishing.",
    "models": [
      {
        "display_name": "Tonda PF",
        "search_aliases": [
          "tonda pf micro-rotor",
          "integrated luxury sport",
          "grain d'orge guilloché",
          "platinum bezel",
          "stealth wealth"
        ]
      },
      {
        "display_name": "Tonda Métrographe",
        "search_aliases": [
          "chronograph",
          "abyss blue",
          "integrated chronograph"
        ]
      },
      {
        "display_name": "Tonda Selene",
        "search_aliases": [
          "moonphase",
          "ladies luxury",
          "complication"
        ]
      },
      {
        "display_name": "Toric",
        "search_aliases": [
          "knurled bezel",
          "classical high-horology",
          "manual wind"
        ]
      }
    ]
  },
  {
    "id": "brand_110",
    "name": "Paul Picot",
    "founding_snippet": "Founded in 1976 in Le Noirmont, Switzerland, by Mario Boiocchi. Despite the quartz crisis, the brand committed to high-end mechanical watchmaking, specializing in complex chronograph modules and refined, classically inspired dress chronometers.",
    "models": [
      {
        "display_name": "Technograph",
        "search_aliases": [
          "animated chronograph",
          "rotating discs",
          "unique design"
        ]
      },
      {
        "display_name": "Firshire",
        "search_aliases": [
          "tonneau",
          "classic dress",
          "chronometer"
        ]
      }
    ]
  },
  {
    "id": "brand_111",
    "name": "Perrelet",
    "founding_snippet": "Founded in 1777 by Abraham-Louis Perrelet, who is historically credited with the invention of the self-winding (automatic) movement. The brand modernly anchors its identity on the 'Double Rotor' complication—a patented system featuring an oscillating weight on the dial side that animates the watch's movement.",
    "models": [
      {
        "display_name": "Turbine",
        "search_aliases": [
          "double rotor",
          "animated dial",
          "sporty",
          "propeller dial"
        ]
      },
      {
        "display_name": "First Class",
        "search_aliases": [
          "classic automatic",
          "open heart",
          "dress mechanical"
        ]
      }
    ]
  },
  {
    "id": "brand_112",
    "name": "Peter Speake-Marin",
    "founding_snippet": "Founded by British watchmaker Peter Speake-Marin in 2002 in Switzerland. The brand is renowned for its distinctive 'Piccadilly' case design, 'topping-tool' shaped hands, and an aesthetic that blends traditional English watchmaking sensibilities with Swiss movement precision.",
    "models": [
      {
        "display_name": "Piccadilly",
        "search_aliases": [
          "topping-tool hands",
          "classical independent",
          "manual wind"
        ]
      },
      {
        "display_name": "One & Two",
        "search_aliases": [
          "openworked",
          "modern independent",
          "dual display"
        ]
      }
    ]
  },
  {
    "id": "brand_113",
    "name": "Petermann Bédat",
    "founding_snippet": "Founded in 2017 by Gaël Petermann and Florian Bédat in Renens, Switzerland. A rising star in the independent watchmaking scene, the atelier is celebrated for its obsession with movement architecture, particularly the 'jumping seconds' complication and impeccably high-grade finishing.",
    "models": [
      {
        "display_name": "Dead Beat Seconds",
        "search_aliases": [
          "jumping seconds",
          "independent watchmaking",
          "bespoke architecture"
        ]
      },
      {
        "display_name": "Chronographe Monopoussoir",
        "search_aliases": [
          "monopusher",
          "hand-finished",
          "horizontal clutch"
        ]
      }
    ]
  },
  {
    "id": "brand_114",
    "name": "Philippe Dufour",
    "founding_snippet": "Widely regarded as the greatest living watchmaker, Philippe Dufour is a legend of the Vallée de Joux. His output is exceptionally limited, and his work, characterized by perfection in hand-finishing and movement architecture, is considered the gold standard by collectors globally.",
    "models": [
      {
        "display_name": "Simplicity",
        "search_aliases": [
          "manual wind",
          "perfect finishing",
          "small seconds",
          "haute horlogerie"
        ]
      },
      {
        "display_name": "Duality",
        "search_aliases": [
          "double escapement",
          "differential",
          "ultra-rare"
        ]
      },
      {
        "display_name": "Grande Sonnerie",
        "search_aliases": [
          "minute repeater",
          "pocket watch",
          "masterpiece"
        ]
      }
    ]
  },
  {
    "id": "brand_115",
    "name": "Piaget",
    "founding_snippet": "Founded in 1874 by Georges-Édouard Piaget in La Côte-aux-Fées. Historically an elite movement supplier, Piaget fundamentally changed the luxury landscape by mastering the art of the 'ultra-thin' movement, creating iconic pieces that are as much jewelry as they are technical marvels.",
    "models": [
      {
        "display_name": "Altiplano",
        "search_aliases": [
          "ultra-thin",
          "manual wind",
          "minimalist dress",
          "cal 9p"
        ]
      },
      {
        "display_name": "Polo",
        "search_aliases": [
          "polo s",
          "integrated luxury sport",
          "cushion dial",
          "modern classic"
        ]
      },
      {
        "display_name": "Limelight",
        "search_aliases": [
          "jewelry watch",
          "gala",
          "high-end artisan"
        ]
      }
    ]
  },
  {
    "id": "brand_116",
    "name": "Purnell",
    "founding_snippet": "Founded in 2020 by Maurizio Mazzocchi in Geneva. Purnell operates at the absolute apex of contemporary haute horlogerie, dedicating its entire production exclusively to the tourbillon. The maison is famous for its hyper-complex 'Spherion'—a triple-axis tourbillon that rotates at record-breaking speeds inside a high-tech sapphire case environment.",
    "models": [
      {
        "display_name": "Escape II",
        "search_aliases": [
          "escape 2",
          "double spherion",
          "triple axis tourbillon",
          "absolute sapphire",
          "carbon matrix"
        ]
      },
      {
        "display_name": "Spherion",
        "search_aliases": [
          "purnell spherion",
          "high-speed tourbillon",
          "diamond set spherion"
        ]
      }
    ]
  },
  {
    "id": "brand_117",
    "name": "Rado",
    "founding_snippet": "Founded in 1917 by the Schlup brothers in Lengnau, Switzerland. Globally acclaimed as the 'Master of Materials,' Rado permanently revolutionized the watch industry by pioneering scratch-proof high-tech ceramic, hardmetal, and plasma ceramic architectures, seamlessly blending retro layouts with modern durability.",
    "models": [
      {
        "display_name": "Captain Cook",
        "search_aliases": [
          "captain cook automatic",
          "ceramic diver",
          "vintage reissue",
          "high-tech ceramic",
          "over-pole"
        ]
      },
      {
        "display_name": "Ceramica",
        "search_aliases": [
          "minimalist ceramic",
          "integrated square",
          "monochrome black"
        ]
      },
      {
        "display_name": "True Square",
        "search_aliases": [
          "open heart",
          "skeleton ceramic",
          "designer collaboration"
        ]
      },
      {
        "display_name": "Diastar",
        "search_aliases": [
          "diastar original",
          "hardmetal bezel",
          "retro tungsten case"
        ]
      }
    ]
  },
  {
    "id": "brand_118",
    "name": "Ressence",
    "founding_snippet": "Founded in 2010 by industrial designer Benoît Mintiens in Antwerp, Belgium. Ressence has completely reimagined how time is displayed, replacing traditional mechanical hands with a patented, ever-changing graphical layout of flush-mounted rotating discs (ROCS), often submerged in oil to achieve perfect optical legibility.",
    "models": [
      {
        "display_name": "Type 1",
        "search_aliases": [
          "type 1 slim",
          "type 1 round",
          "rocs movement",
          "no crown watch",
          "lever winding"
        ]
      },
      {
        "display_name": "Type 3",
        "search_aliases": [
          "type 3 black",
          "oil filled watch",
          "magnetic transmission",
          "bellows system"
        ]
      },
      {
        "display_name": "Type 5",
        "search_aliases": [
          "type 5 diver",
          "oil-filled diver",
          "underwater legibility",
          "titanium case"
        ]
      },
      {
        "display_name": "Type 8",
        "search_aliases": [
          "type 8 minimalist",
          "entry level ressence",
          "cobalt blue"
        ]
      },
      {
        "display_name": "Type 2",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_119",
    "name": "Raymond Weil",
    "founding_snippet": "Founded in 1976 in Geneva, Switzerland, during the height of the quartz crisis. One of the last independent, family-owned Swiss watch companies, Raymond Weil infuses its deep love for music and arts into traditional luxury watch collections, highly regarded for their elegant dress designs and proprietary in-house automatic calibers.",
    "models": [
      {
        "display_name": "Freelancer",
        "search_aliases": [
          "freelancer chronograph",
          "diver 300m",
          "calibre rw1212",
          "open heart flyback"
        ]
      },
      {
        "display_name": "Mestro",
        "search_aliases": [
          "maestro moonphase",
          "classical dress",
          "open heart manual"
        ]
      },
      {
        "display_name": "Toccata",
        "search_aliases": [
          "minimalist quartz",
          "slim dress watch",
          "roman numerals"
        ]
      }
    ]
  },
  {
    "id": "brand_120",
    "name": "RGM Watch Company",
    "founding_snippet": "Founded in 1992 by American watchmaker Roland G. Murphy in Lancaster County, Pennsylvania. RGM represents the absolute peak of modern American watchmaking, keeping traditional hand-craft alive on US soil with a dedicated workshop that utilizes historical rose engines for hand-guilloché dials and engineers high-end in-house movements.",
    "models": [
      {
        "display_name": "Pennsylvania Tourbillon",
        "search_aliases": [
          "calibre 801",
          "american tourbillon",
          "keystone bridges",
          "wolf tooth gearing"
        ]
      },
      {
        "display_name": "Model 801",
        "search_aliases": [
          "801 ee",
          "classic american pocket watch engine",
          "hand-guilloché enamel"
        ]
      },
      {
        "display_name": "Corps of Engineers",
        "search_aliases": [
          "model 222",
          "hamilton grade 992b replacement",
          "military enamel dial"
        ]
      }
    ]
  },
  {
    "id": "brand_121",
    "name": "Richard Mille",
    "founding_snippet": "Founded in 2001 in Les Breuleux, Switzerland. The brand operates as a 'technical laboratory' for high-end watchmaking, focusing on 'racing machines for the wrist' by utilizing extreme aerospace materials (carbon TPT, grade 5 titanium) and hyper-complex movements that withstand severe G-forces.",
    "models": [
      {
        "display_name": "RM 011",
        "search_aliases": [
          "felipe massa",
          "flyback chronograph",
          "tonneau case",
          "sport luxury"
        ]
      },
      {
        "display_name": "RM 27",
        "search_aliases": [
          "rafael nadal",
          "tourbillon",
          "ultra-light",
          "manual wind"
        ]
      },
      {
        "display_name": "RM 67",
        "search_aliases": [
          "automatic extra flat",
          "skeleton",
          "slim tonneau"
        ]
      },
      {
        "display_name": "RM 035",
        "search_aliases": [
          "baby nadal",
          "carbon tpt",
          "automatic sport"
        ]
      }
    ]
  },
  {
    "id": "brand_122",
    "name": "Roger Dubuis",
    "founding_snippet": "Founded in 1995 by Roger Dubuis and Carlos Dias. The brand is defined by its 'Hyper Horology' philosophy, pushing boundaries with skeletonized calibers, multi-tourbillon architectures, and bold design languages that meet the rigorous Geneva Seal (Poinçon de Genève) standards.",
    "models": [
      {
        "display_name": "Excalibur",
        "search_aliases": [
          "spider skeleton",
          "flying tourbillon",
          "double tourbillon",
          "star motif movement"
        ]
      },
      {
        "display_name": "Monaco",
        "search_aliases": [
          "vintage racing",
          "chronograph",
          "classic sport"
        ]
      },
      {
        "display_name": "Velvet",
        "search_aliases": [
          "jewelry watch",
          "feminine skeleton",
          "haute joaillerie"
        ]
      }
    ]
  },
  {
    "id": "brand_123",
    "name": "Rolex",
    "founding_snippet": "Founded in 1905 by Hans Wilsdorf in London (relocated to Geneva). The undisputed titan of the luxury watch industry, Rolex set the global standard for tool watches with the invention of the waterproof Oyster case and the Perpetual rotor, epitomizing reliable, robust, and highly liquid investment-grade watchmaking.",
    "models": [
      {
        "display_name": "Submariner",
        "search_aliases": [
          "126610ln",
          "126610lv",
          "no-date",
          "professional diver",
          "ceramic bezel"
        ]
      },
      {
        "display_name": "Daytona",
        "search_aliases": [
          "116500ln",
          "126500ln",
          "cosmograph",
          "chronograph",
          "le mans"
        ]
      },
      {
        "display_name": "Datejust",
        "search_aliases": [
          "36mm",
          "41mm",
          "fluted bezel",
          "jubilee bracelet",
          "everyday luxury"
        ]
      },
      {
        "display_name": "GMT-Master II",
        "search_aliases": [
          "batman",
          "pepsi",
          "sprite",
          "126710blnr",
          "travel watch"
        ]
      },
      {
        "display_name": "Day-Date",
        "search_aliases": [
          "president",
          "gold watch",
          "40mm",
          "day and date aperture"
        ]
      }
    ]
  },
  {
    "id": "brand_124",
    "name": "Romain Gauthier",
    "founding_snippet": "Founded in 2005 in Le Sentier, Switzerland. An elite independent atelier where every movement component is hand-finished to a standard that borders on obsession. Romain Gauthier is famous for innovative mechanisms like horizontal push-button crowns and proprietary in-house calibers with unique curved bridge architecture.",
    "models": [
      {
        "display_name": "Logical One",
        "search_aliases": [
          "fusee and chain",
          "constant force",
          "push button winding",
          "haute horlogerie"
        ]
      },
      {
        "display_name": "Insight",
        "search_aliases": [
          "micro-rotor",
          "asymmetrical dial",
          "openworked movement"
        ]
      },
      {
        "display_name": "Continuum",
        "search_aliases": [
          "titanium case",
          "sporty independent",
          "sculptural bridge"
        ]
      }
    ]
  },
  {
    "id": "brand_125",
    "name": "Romain Jerome (RJ)",
    "founding_snippet": "Founded in 2004 in Geneva, the brand gained notoriety for 'DNA-based' concepts, incorporating materials like Titanic steel, lunar dust, and volcanic ash into their watches. While the original iteration ceased, it persists in the collector market as a prime example of provocative, narrative-driven horological design.",
    "models": [
      {
        "display_name": "Titanic-DNA",
        "search_aliases": [
          "rusted steel bezel",
          "steampunk",
          "marine wreckage material"
        ]
      },
      {
        "display_name": "Moon-DNA",
        "search_aliases": [
          "moondust dial",
          "apollo mission",
          "space-themed"
        ]
      },
      {
        "display_name": "Super-Alloy",
        "search_aliases": [
          "videogame collaboration",
          "pac-man",
          "space invaders",
          "pop culture"
        ]
      }
    ]
  },
  {
    "id": "brand_126",
    "name": "Sarpaneva Watches",
    "founding_snippet": "Founded in 2003 by Stepan Sarpaneva in Helsinki, Finland. Sarpaneva is a master of avant-garde, gothic-inspired watchmaking. His designs are instantly recognizable for their aggressive, industrial-art aesthetic, often featuring moonphase complications with his own stylized, 'menacing' moon-face engravings.",
    "models": [
      {
        "display_name": "Korona",
        "search_aliases": [
          "moonphase",
          "openworked",
          "gothic design",
          "steampunk",
          "stainless steel outokumpu"
        ]
      },
      {
        "display_name": "K1",
        "search_aliases": [
          "minimalist",
          "independent Finnish",
          "sarpaneva case"
        ]
      },
      {
        "display_name": "Northern Stars",
        "search_aliases": [
          "astronomical complication",
          "bespoke moon",
          "luminous dial"
        ]
      }
    ]
  },
  {
    "id": "brand_127",
    "name": "Schaumburg Watch",
    "founding_snippet": "Founded in 1998 in Rinteln, Germany. The brand is known for producing high-quality, technically adventurous watches at accessible price points, specializing in unique complications like regulator layouts, hand-guilloché dials, and their proprietary 'Planetarium' moonphase displays.",
    "models": [
      {
        "display_name": "Planetarium",
        "search_aliases": [
          "moonphase",
          "solar system display",
          "astronomical complication"
        ]
      },
      {
        "display_name": "Gnomonik",
        "search_aliases": [
          "single hand",
          "one-hand watch",
          "minimalist"
        ]
      },
      {
        "display_name": "Urban",
        "search_aliases": [
          "classic dress",
          "chronograph",
          "german engineering"
        ]
      }
    ]
  },
  {
    "id": "brand_128",
    "name": "Seiko",
    "founding_snippet": "Founded in 1881 by Kintaro Hattori in Tokyo, Japan. A horological colossus that revolutionized the industry with the introduction of the first commercial quartz watch (Astron, 1969). Seiko is a vertically integrated giant, producing everything from affordable, reliable workhorses to high-end, hand-finished luxury pieces through its sub-brands.",
    "models": [
      {
        "display_name": "Prospex",
        "search_aliases": [
          "turtle",
          "samurai",
          "sumo",
          "tuna",
          "willard",
          "diver",
          "professional tool watch"
        ]
      },
      {
        "display_name": "Presage",
        "search_aliases": [
          "cocktail time",
          "enamel dial",
          "urushi lacquer",
          "japanese craft",
          "automatic"
        ]
      },
      {
        "display_name": "Astron",
        "search_aliases": [
          "gps solar",
          "quartz revolution",
          "world time",
          "high-tech"
        ]
      },
      {
        "display_name": "Seiko 5 Sports",
        "search_aliases": [
          "skx reissue",
          "everyday automatic",
          "entry level",
          "street style"
        ]
      }
    ]
  },
  {
    "id": "brand_129",
    "name": "Sinn Spezialuhren",
    "founding_snippet": "Founded in 1961 by pilot and flight instructor Helmut Sinn in Frankfurt, Germany. Sinn is the definitive German tool-watch brand, engineering timepieces to DIN standards for diving and aviation. They are famous for extreme-use technologies like Tegimented (scratch-proof) steel, Ar-Dehumidifying, and oil-filled housings.",
    "models": [
      {
        "display_name": "U1",
        "search_aliases": [
          "submarine steel",
          "tegimented",
          "diver",
          "professional tool"
        ]
      },
      {
        "display_name": "EZM",
        "search_aliases": [
          "mission timer",
          "ezm 1",
          "ezm 3",
          "ezm 10",
          "military aviation",
          "chronograph"
        ]
      },
      {
        "display_name": "103",
        "search_aliases": [
          "pilot chronograph",
          "classic flieger",
          "valjoux 7750"
        ]
      },
      {
        "display_name": "900",
        "search_aliases": [
          "diapal",
          "gmt",
          "flieger",
          "instrument watch"
        ]
      }
    ]
  },
  {
    "id": "brand_130",
    "name": "Singer Reimagined",
    "founding_snippet": "Founded in 2017 in Geneva by Rob Dickinson (of Singer Vehicle Design) and horological master Marco Borraccino. The brand applies the 'Singer' philosophy of perfection—restoring and upgrading classic Porsche 911s—to high-end watchmaking, centering their design on a revolutionary central-display chronograph movement.",
    "models": [
      {
        "display_name": "Track1",
        "search_aliases": [
          "central chronograph",
          "agenger movement",
          "automatic",
          "integrated bracelet",
          "racing aesthetic"
        ]
      },
      {
        "display_name": "Flytrack",
        "search_aliases": [
          "flyback",
          "minimalist chronograph",
          "central seconds",
          "timer"
        ]
      }
    ]
  },
  {
    "id": "brand_131",
    "name": "Speake-Marin",
    "founding_snippet": "Originally founded by Peter Speake-Marin, the brand has since evolved into an independent manufacture focused on 'contemporary elegance.' Known for their distinctive 'Piccadilly' case, they blend traditional English-inspired horological details with modern, open-worked movement architectures.",
    "models": [
      {
        "display_name": "Ripples",
        "search_aliases": [
          "integrated bracelet",
          "sports luxury",
          "ripple dial",
          "steel"
        ]
      },
      {
        "display_name": "One & Two",
        "search_aliases": [
          "openworked",
          "dual time",
          "modern independent"
        ]
      },
      {
        "display_name": "Academic",
        "search_aliases": [
          "minimalist",
          "topping tool hands",
          "dress watch"
        ]
      }
    ]
  },
  {
    "id": "brand_132",
    "name": "Stowa",
    "founding_snippet": "Founded in 1927 by Walter Storz in Pforzheim, Germany. Stowa is one of the original five manufacturers commissioned to produce the B-Uhr (observation watch) for the German Air Force during WWII. Today, they remain a quintessential brand for authentic, history-steeped Flieger and Bauhaus-style timepieces.",
    "models": [
      {
        "display_name": "Flieger",
        "search_aliases": [
          "flieger classic",
          "b-uhr",
          "type a",
          "type b",
          "historical pilot",
          "manual wind"
        ]
      },
      {
        "display_name": "Antea",
        "search_aliases": [
          "bauhaus",
          "minimalist",
          "durell",
          "small seconds"
        ]
      },
      {
        "display_name": "Marine",
        "search_aliases": [
          "marine classic",
          "deck watch",
          "roman numerals",
          "white enamel"
        ]
      }
    ]
  },
  {
    "id": "brand_133",
    "name": "Studio Underd0g",
    "founding_snippet": "Founded in 2021 by Richard Benc in the UK. A design-forward microbrand that disrupted the industry by pairing playful, vibrant color palettes—inspired by food, fruit, and nostalgia—with high-quality mechanical movements and a refreshing, non-serious aesthetic.",
    "models": [
      {
        "display_name": "Chronograph",
        "search_aliases": [
          "watermelon",
          "goofy",
          "mint choc chip",
          "aubergine",
          "seagull st-19",
          "colorful dial"
        ]
      },
      {
        "display_name": "Field",
        "search_aliases": [
          "field watch",
          "minimalist",
          "hand-wound"
        ]
      }
    ]
  },
  {
    "id": "brand_134",
    "name": "SUF Helsinki",
    "founding_snippet": "Founded by Stepan Sarpaneva in Helsinki, Finland. Representing his 'everyday' and more approachable counterpart to his eponymous haute-horology brand, SUF focuses on clean, rugged tool watches that draw inspiration from Finnish geography, industrial heritage, and the brutalism of the north.",
    "models": [
      {
        "display_name": "180",
        "search_aliases": [
          "field watch",
          "minimalist",
          "rugged",
          "finnish design"
        ]
      },
      {
        "display_name": "Paroni",
        "search_aliases": [
          "racing",
          "sport",
          "classic tool"
        ]
      }
    ]
  },
  {
    "id": "brand_135",
    "name": "TAG Heuer",
    "founding_snippet": "Founded in 1860 by Edouard Heuer in St-Imier, Switzerland. TAG Heuer is the definitive marque for motor-racing-inspired chronographs, famously introducing the 'Mikrogirder' and 'Monaco' (the first square water-resistant chronograph, worn by Steve McQueen), bridging the worlds of high-tech timing and bold, athletic aesthetics.",
    "models": [
      {
        "display_name": "Monaco",
        "search_aliases": [
          "square case",
          "calibre 11",
          "steve mcqueen",
          "racing chronograph"
        ]
      },
      {
        "display_name": "Carrera",
        "search_aliases": [
          "carrera glassbox",
          "chronograph",
          "racing",
          "tachymeter",
          "modern classic"
        ]
      },
      {
        "display_name": "Autavia",
        "search_aliases": [
          "pilot chronograph",
          "vintage racing",
          "isograph"
        ]
      },
      {
        "display_name": "Aquaracer",
        "search_aliases": [
          "professional 300",
          "diver",
          "ceramic",
          "gmt"
        ]
      }
    ]
  },
  {
    "id": "brand_136",
    "name": "TanTan",
    "founding_snippet": "A boutique Japanese independent studio led by watchmaker TanTan, focusing on highly artistic, hand-crafted dials and bespoke mechanical timepieces that blend traditional Japanese aesthetics with minimalist, clean horological movements.",
    "models": [
      {
        "display_name": "Artisanal",
        "search_aliases": [
          "bespoke dial",
          "hand-finished",
          "independent studio",
          "japanese craftsmanship"
        ]
      }
    ]
  },
  {
    "id": "brand_137",
    "name": "Tauchmeister 1937",
    "founding_snippet": "Founded in Germany, this brand focuses on producing large, highly durable, and affordable divers and pilot watches. They are well-known for their 'oversized' aesthetic and reliance on robust, reliable automatic or quartz movements for professional use.",
    "models": [
      {
        "display_name": "Professional Diver",
        "search_aliases": [
          "oversized diver",
          "helium valve",
          "1000m",
          "tool watch"
        ]
      },
      {
        "display_name": "Aviator",
        "search_aliases": [
          "pilot watch",
          "military style",
          "large case"
        ]
      }
    ]
  },
  {
    "id": "brand_138",
    "name": "Techné",
    "founding_snippet": "Founded in 2009 by Francis Jacquerye. Based in Switzerland, Techné focuses on 'instrumental' design, creating ultra-legible, functional watches that borrow heavily from aviation and military cockpit displays, aiming for accessibility without sacrificing tool-watch reliability.",
    "models": [
      {
        "display_name": "Merlin",
        "search_aliases": [
          "pilot chronograph",
          "cockpit instrument",
          "field watch"
        ]
      },
      {
        "display_name": "Sparrowhawk",
        "search_aliases": [
          "chronograph",
          "military tool",
          "minimalist"
        ]
      }
    ]
  },
  {
    "id": "brand_139",
    "name": "Tissot",
    "founding_snippet": "Founded in 1853 by Charles-Félicien Tissot and his son in Le Locle, Switzerland. A pillar of the Swatch Group, Tissot is renowned for its incredible legacy of 'innovation by tradition,' offering high-performance mechanical and quartz watches that define the entry-level Swiss luxury market.",
    "models": [
      {
        "display_name": "PRX",
        "search_aliases": [
          "integrated bracelet",
          "powermatic 80",
          "quartz",
          "tiffany blue",
          "modern sport",
          "70s revival"
        ]
      },
      {
        "display_name": "Le Locle",
        "search_aliases": [
          "automatic",
          "classic dress",
          "guilloché dial"
        ]
      },
      {
        "display_name": "Seastar",
        "search_aliases": [
          "diver 1000",
          "diver 2000",
          "professional diver"
        ]
      },
      {
        "display_name": "Gentleman",
        "search_aliases": [
          "everyday watch",
          "silicium hairspring",
          "modern dress"
        ]
      }
    ]
  },
  {
    "id": "brand_140",
    "name": "Trilobe",
    "founding_snippet": "Founded in 2018 in Paris, France. Trilobe has gained fame for its radical time-display concept: abandoning traditional hands in favor of three rotating rings (hours, minutes, seconds) that orbit around a central fixed marker, creating a poetic, orbital dance of time.",
    "models": [
      {
        "display_name": "Les Matinaux",
        "search_aliases": [
          "orbital time",
          "rotating rings",
          "minimalist",
          "poetic display"
        ]
      },
      {
        "display_name": "Nuit Fantastique",
        "search_aliases": [
          "rotating disks",
          "art deco",
          "avant-garde dial"
        ]
      },
      {
        "display_name": "Une Folle Journée",
        "search_aliases": [
          "suspended rings",
          "3d movement",
          "haute horlogerie"
        ]
      }
    ]
  },
  {
    "id": "brand_141",
    "name": "Tudor",
    "founding_snippet": "Founded in 1926 by Hans Wilsdorf (the founder of Rolex). Originally conceived as a more accessible alternative to Rolex, Tudor has evolved into a powerhouse of design-led, tool-watch production, heavily emphasizing its 'Born to Dare' ethos, vintage-inspired aesthetics, and high-performance in-house manufacture movements.",
    "models": [
      {
        "display_name": "Black Bay",
        "search_aliases": [
          "bb58",
          "black bay 58",
          "black bay pro",
          "black bay chrono",
          "diver",
          "snowflake hands",
          "vintage diver"
        ]
      },
      {
        "display_name": "Pelagos",
        "search_aliases": [
          "pelagos 39",
          "pelagos lhd",
          "titanium diver",
          "professional tool watch",
          "diver 500m"
        ]
      },
      {
        "display_name": "Royal",
        "search_aliases": [
          "integrated bracelet",
          "sport-chic",
          "day-date",
          "sunray dial"
        ]
      },
      {
        "display_name": "North Flag",
        "search_aliases": [
          "in-house calibre",
          "power reserve indicator",
          "explorer watch"
        ]
      }
    ]
  },
  {
    "id": "brand_142",
    "name": "Tutima Glashütte",
    "founding_snippet": "Founded in 1927 in Glashütte, Germany. Tutima is a storied name in German watchmaking, best known for its legendary Flieger chronographs issued to German pilots in the 1940s. Today, it remains one of the few Glashütte houses producing robust, precision-engineered pilot watches and chronographs in the town's traditional style.",
    "models": [
      {
        "display_name": "M2",
        "search_aliases": [
          "nato chronograph",
          "military tool watch",
          "titanium",
          "professional aviation"
        ]
      },
      {
        "display_name": "Grand Flieger",
        "search_aliases": [
          "flieger classic",
          "vintage pilot",
          "chronograph",
          "coin-edge bezel"
        ]
      },
      {
        "display_name": "Saxon One",
        "search_aliases": [
          "pyramidal case",
          "sports chronograph",
          "german design"
        ]
      }
    ]
  },
  {
    "id": "brand_143",
    "name": "U-Boat",
    "founding_snippet": "Founded in 2000 by Italo Fontana in Lucca, Italy. Inspired by the designs of 1940s Italian naval instruments, U-Boat is known for its highly distinctive, large-scale, 'left-handed' crown configurations and aggressive tool-watch aesthetics that prioritize high legibility and rugged construction.",
    "models": [
      {
        "display_name": "Classico",
        "search_aliases": [
          "left-hand crown",
          "oversized",
          "military style",
          "italo fontana"
        ]
      },
      {
        "display_name": "Chimera",
        "search_aliases": [
          "skeletonized",
          "complex case",
          "industrial design"
        ]
      },
      {
        "display_name": "Darkmoon",
        "search_aliases": [
          "oil-filled",
          "high legibility",
          "quartz precision"
        ]
      }
    ]
  },
  {
    "id": "brand_144",
    "name": "Ulysse Nardin",
    "founding_snippet": "Founded in 1846 in Le Locle, Switzerland. Historically the world’s most decorated manufacturer of marine chronometers, the brand evolved into a modern high-horology house known for its technical audacity, including pioneering the use of silicium in movements and creating the legendary Freak—a movement that acts as its own escapement.",
    "models": [
      {
        "display_name": "Freak",
        "search_aliases": [
          "freak x",
          "no hands",
          "tourbillon carousel",
          "silicium escapement",
          "avant-garde"
        ]
      },
      {
        "display_name": "Marine",
        "search_aliases": [
          "marine torpilleur",
          "marine chronograph",
          "chronometer",
          "nautical heritage"
        ]
      },
      {
        "display_name": "Diver",
        "search_aliases": [
          "diver x",
          "great white",
          "44mm",
          "professional marine"
        ]
      },
      {
        "display_name": "Blast",
        "search_aliases": [
          "skeleton tourbillon",
          "geometric case",
          "modern luxury"
        ]
      }
    ]
  },
  {
    "id": "brand_145",
    "name": "Union Glashütte",
    "founding_snippet": "Founded in 1893 by Johannes Dürrstein in Glashütte, Germany. Originally positioned as a more accessible counterpart to the high-end manufacturers of the region, Union Glashütte continues this heritage today by offering beautifully finished, high-quality German watches that utilize the prestige of the 'Glashütte' label at a competitive entry point.",
    "models": [
      {
        "display_name": "Belisar",
        "search_aliases": [
          "chronograph",
          "gmt",
          "sport classic",
          "vintage design"
        ]
      },
      {
        "display_name": "Noramis",
        "search_aliases": [
          "noramis datum",
          "minimalist dress",
          "retro 50s",
          "everyday watch"
        ]
      },
      {
        "display_name": "Viro",
        "search_aliases": [
          "automatic",
          "clean dial",
          "dress watch"
        ]
      }
    ]
  },
  {
    "id": "brand_146",
    "name": "Urwerk",
    "founding_snippet": "Founded in 1997 by Felix Baumgartner and Martin Frei. Urwerk is an avant-garde horological laboratory famous for its 'satellite' time indication, where time is displayed via rotating planetary discs, and its industrial, sci-fi inspired case architectures that feel like they belong on a spaceship.",
    "models": [
      {
        "display_name": "UR-100",
        "search_aliases": [
          "satellite indication",
          "space time",
          "orbital hour",
          "industrial design"
        ]
      },
      {
        "display_name": "UR-105",
        "search_aliases": [
          "t-rex",
          "bronze case",
          "wandering hours",
          "cushion case"
        ]
      },
      {
        "display_name": "UR-200",
        "search_aliases": [
          "revolving satellites",
          "telescoping hands",
          "sci-fi complication"
        ]
      },
      {
        "display_name": "EMC",
        "search_aliases": [
          "electro-mechanical control",
          "user-adjustable accuracy",
          "mechanical innovation"
        ]
      }
    ]
  },
  {
    "id": "brand_147",
    "name": "Vacheron Constantin",
    "founding_snippet": "Founded in 1755 in Geneva, Switzerland. As the oldest watch manufacturer in continuous operation, Vacheron Constantin is one of the 'Holy Trinity' of Swiss watchmaking, renowned for producing arguably the most refined finishing in the world and representing the pinnacle of grand complications and heritage craftsmanship.",
    "models": [
      {
        "display_name": "Overseas",
        "search_aliases": [
          "integrated luxury sport",
          "malte cross bezel",
          "interchangeable strap",
          "dual time",
          "chronograph"
        ]
      },
      {
        "display_name": "Patrimony",
        "search_aliases": [
          "minimalist dress",
          "ultra-thin",
          "classical Geneva",
          "manual wind"
        ]
      },
      {
        "display_name": "Traditionnelle",
        "search_aliases": [
          "tourbillon",
          "perpetual calendar",
          "high-horology",
          "classical architecture"
        ]
      },
      {
        "display_name": "Historiques",
        "search_aliases": [
          "cornes de vache",
          "222",
          "american 1921",
          "vintage reissue"
        ]
      }
    ]
  },
  {
    "id": "brand_148",
    "name": "Van Cleef & Arpels",
    "founding_snippet": "Founded in 1896 in Paris, France. Originally a high-jewelry maison, Van Cleef & Arpels entered the world of horology by applying their mastery of decorative arts to 'Poetic Complications'—timepieces that use intricate automatons and dials to tell whimsical, dreamlike stories.",
    "models": [
      {
        "display_name": "Poetic Complications",
        "search_aliases": [
          "lady arpels",
          "pont des amoureux",
          "astronomy",
          "automaton",
          "poetic astronomy"
        ]
      },
      {
        "display_name": "Pierre Arpels",
        "search_aliases": [
          "slim dress watch",
          "classical jewelry",
          "minimalist"
        ]
      }
    ]
  },
  {
    "id": "brand_149",
    "name": "Vianney Halter",
    "founding_snippet": "Founded by visionary independent watchmaker Vianney Halter. His work is celebrated as 'Future Past' horology—creating complex, high-horology pieces that appear to have been plucked from a Jules Verne novel, featuring unique movement architectures like his signature 'Janus' jumping hour display.",
    "models": [
      {
        "display_name": "Antiqua",
        "search_aliases": [
          "perpetual calendar",
          "riveted case",
          "steampunk",
          "four-dial display"
        ]
      },
      {
        "display_name": "Deep Space",
        "search_aliases": [
          "triple axis tourbillon",
          "central tourbillon",
          "spherical case"
        ]
      },
      {
        "display_name": "Janus",
        "search_aliases": [
          "jump hour",
          "double face",
          "classical-futuristic"
        ]
      }
    ]
  },
  {
    "id": "brand_150",
    "name": "Victorinox Swiss Army",
    "founding_snippet": "Founded in 1884 by Karl Elsener in Ibach, Switzerland. Best known for the iconic Swiss Army Knife, the brand expanded into watchmaking with a focus on 'guaranteed durability,' engineering robust, high-value field and dive watches designed for active, everyday, and outdoor use.",
    "models": [
      {
        "display_name": "I.N.O.X.",
        "search_aliases": [
          "inox carbon",
          "inox professional diver",
          "indestructible watch",
          "shockproof"
        ]
      },
      {
        "display_name": "FieldForce",
        "search_aliases": [
          "everyday field",
          "minimalist",
          "high legibility"
        ]
      },
      {
        "display_name": "Alliance",
        "search_aliases": [
          "dress watch",
          "modern everyday",
          "clean aesthetic"
        ]
      },
      {
        "display_name": "Maverick",
        "search_aliases": []
      },
      {
        "display_name": "Airboss",
        "search_aliases": []
      },
      {
        "display_name": "Dive Pro",
        "search_aliases": []
      },
      {
        "display_name": "Night Vision",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_151",
    "name": "Voutilainen (Kari Voutilainen - Collaborations/Sub-Brands)",
    "founding_snippet": "This category encompasses collaborative horological projects and sub-entities (like Urban Jürgensen ownership/involvement) that leverage the legendary finishing standards, proprietary escapement engineering, and aesthetic mastery of master watchmaker Kari Voutilainen.",
    "models": [
      {
        "display_name": "Collaborative Pieces",
        "search_aliases": [
          "bespoke caliber",
          "independent collaboration",
          "observatory grade"
        ]
      }
    ]
  },
  {
    "id": "brand_152",
    "name": "Vulcan (Vulcain)",
    "founding_snippet": "Founded in 1858 in La Chaux-de-Fonds, Switzerland. The brand is globally iconic for the 'Cricket,' the first reliable mechanical alarm wristwatch, which became the favored timepiece of many U.S. Presidents (earning it the nickname 'The President's Watch').",
    "models": [
      {
        "display_name": "Cricket",
        "search_aliases": [
          "president's watch",
          "mechanical alarm",
          "calibre cricket",
          "vintage alarm"
        ]
      },
      {
        "display_name": "Nautique",
        "search_aliases": [
          "skin diver",
          "vintage diver",
          "compressor style"
        ]
      }
    ]
  },
  {
    "id": "brand_153",
    "name": "Weiss Watch Company",
    "founding_snippet": "Founded in 2013 by Cameron Weiss in Los Angeles, USA. A pioneering independent American brand, Weiss is committed to the revival of domestic watchmaking, hand-finishing their own movements and dials in-house using traditional Swiss-inspired techniques.",
    "models": [
      {
        "display_name": "Standard Issue",
        "search_aliases": [
          "field watch",
          "manual wind",
          "american made",
          "calibre 1003"
        ]
      },
      {
        "display_name": "Automatic Issue",
        "search_aliases": [
          "american automatic",
          "los angeles dial",
          "in-house finishing"
        ]
      }
    ]
  },
  {
    "id": "brand_154",
    "name": "Xeric",
    "founding_snippet": "Founded in 2013 in California, USA. A design-forward microbrand specializing in accessible, avant-garde timepieces. Xeric is famous for utilizing unconventional time-display mechanisms, such as wandering hours, halos, and retrograde complications, often inspired by retro-futurism and space themes.",
    "models": [
      {
        "display_name": "Wandering Hour",
        "search_aliases": [
          "wandering hour",
          "jumping hour",
          "low cost complication"
        ]
      },
      {
        "display_name": "Halograph",
        "search_aliases": [
          "halo display",
          "dual balance wheel",
          "space watch"
        ]
      },
      {
        "display_name": "Trappist-1",
        "search_aliases": [
          "nasa inspired",
          "planetary dial",
          "space design"
        ]
      }
    ]
  },
  {
    "id": "brand_155",
    "name": "Yema",
    "founding_snippet": "Founded in 1948 in Morteau, France. A historic French manufacturer that famously supplied watches for the French Air Force and deep-sea diving expeditions. Recently revived, they focus on high-value, tool-oriented diver and pilot watches that utilize their own proprietary in-house French movements.",
    "models": [
      {
        "display_name": "Superman",
        "search_aliases": [
          "superman heritage",
          "bezel lock",
          "diver",
          "french tool watch"
        ]
      },
      {
        "display_name": "Flygraf",
        "search_aliases": [
          "pilot chronograph",
          "military style",
          "french aviation"
        ]
      },
      {
        "display_name": "Navygraf",
        "search_aliases": [
          "marine nationale",
          "professional diver",
          "in-house movement"
        ]
      }
    ]
  },
  {
    "id": "brand_156",
    "name": "Zeitwinkel",
    "founding_snippet": "Founded in 2006 in Saint-Imier, Switzerland. An ultra-exclusive independent brand that produces no more than 100 watches per year, Zeitwinkel is a true custodian of traditional craftsmanship, utilizing proprietary in-house automatic movements with German silver plates and hand-finished decorations that cannot be automated.",
    "models": [
      {
        "display_name": "Midsize (39mm)",
        "search_aliases": [
          "188° silver",
          "083° rhodium",
          "083° blue",
          "independent Swiss"
        ]
      },
      {
        "display_name": "Classic (42.5mm)",
        "search_aliases": [
          "273° silver",
          "181° black",
          "181° silver",
          "flagship",
          "in-house caliber"
        ]
      }
    ]
  },
  {
    "id": "brand_157",
    "name": "Zenith",
    "founding_snippet": "Founded in 1865 in Le Locle, Switzerland, by Georges Favre-Jacot. Zenith is a legendary pioneer of high-frequency precision, most famous for creating the El Primero in 1969—the world’s first integrated automatic chronograph movement capable of measuring 1/10th of a second.",
    "models": [
      {
        "display_name": "Chronomaster",
        "search_aliases": [
          "el primero",
          "sport",
          "original",
          "revival",
          "1/10th second",
          "chronograph",
          "tri-color dial"
        ]
      },
      {
        "display_name": "Defy",
        "search_aliases": [
          "defy skyline",
          "defy extreme",
          "defy 21",
          "high-frequency",
          "modern avant-garde"
        ]
      },
      {
        "display_name": "Pilot",
        "search_aliases": [
          "pilot type 20",
          "big pilot",
          "onion crown",
          "historical aviation"
        ]
      }
    ]
  },
  {
    "id": "brand_158",
    "name": "Zodiac",
    "founding_snippet": "Founded in 1882 by Ariste Calame in Le Locle, Switzerland. Historically recognized for its technical innovations—including early automatic sports watches and the iconic 'Sea Wolf' diver (1953)—Zodiac is a celebrated name in the vintage-revival space, offering robust, colorful, and historically significant tool watches.",
    "models": [
      {
        "display_name": "Super Sea Wolf",
        "search_aliases": [
          "skin diver",
          "diver 53",
          "compression case",
          "professional diver",
          "vintage reissue"
        ]
      },
      {
        "display_name": "Aerospace",
        "search_aliases": [
          "gmt",
          "world timer",
          "red bezel",
          "24-hour bezel"
        ]
      },
      {
        "display_name": "Astrographic",
        "search_aliases": [
          "floating hands",
          "mystery dial",
          "1969 design icon"
        ]
      }
    ]
  },
  {
    "id": "brand_159",
    "name": "Mido",
    "founding_snippet": "Founded in 1918 by Georges Schaeren in Biel/Bienne, Switzerland. Now a powerhouse within the Swatch Group, Mido is celebrated for its architectural design inspiration and high-value, robust mechanical watches, often featuring chronometer-certified calibers and excellent water resistance.",
    "models": [
      {
        "display_name": "Ocean Star",
        "search_aliases": [
          "diver",
          "ocean star gmt",
          "decompression timer",
          "captain"
        ]
      },
      {
        "display_name": "Multifort",
        "search_aliases": [
          "tv big date",
          "côtes de genève dial",
          "sport classic"
        ]
      },
      {
        "display_name": "Commander",
        "search_aliases": [
          "monocoque case",
          "vintage dress",
          "shade"
        ]
      }
    ]
  },
  {
    "id": "brand_160",
    "name": "Panerai (Officine Panerai)",
    "founding_snippet": "Founded in 1860 in Florence, Italy. Panerai is globally iconic for its oversized, cushion-shaped tool watches originally supplied to the Italian Navy's elite diving units (Decima Flottiglia MAS), famous for their sandwich dials and patented crown-protecting bridges.",
    "models": [
      {
        "display_name": "Luminor",
        "search_aliases": [
          "luminor marina",
          "pam",
          "crown guard",
          "sandwich dial",
          "due"
        ]
      },
      {
        "display_name": "Radiomir",
        "search_aliases": [
          "wire lugs",
          "vintage italian",
          "california dial"
        ]
      },
      {
        "display_name": "Submersible",
        "search_aliases": [
          "professional diver",
          "carbotech",
          "bronzo"
        ]
      }
    ]
  },
  {
    "id": "brand_161",
    "name": "Porsche Design",
    "founding_snippet": "Founded in 1972 by Ferdinand Alexander Porsche (designer of the Porsche 911). The brand revolutionized horology by introducing the world's first all-black chronograph (Chronograph 1) and the first all-titanium watch (Titan Chronograph), fundamentally bridging automotive engineering with high-performance timekeeping.",
    "models": [
      {
        "display_name": "Chronograph 1",
        "search_aliases": [
          "black pvd",
          "top gun",
          "vintage aviation",
          "valjoux 7750"
        ]
      },
      {
        "display_name": "Monobloc Actuator",
        "search_aliases": [
          "titanium chronograph",
          "integrated pushers",
          "automotive engineering"
        ]
      },
      {
        "display_name": "1919",
        "search_aliases": [
          "globetimer",
          "datetimer",
          "minimalist sport"
        ]
      }
    ]
  },
  {
    "id": "brand_162",
    "name": "Squale",
    "founding_snippet": "Founded in 1959 by Charles von Büren in Neuchâtel, Switzerland. Historically one of the most important dive watch case manufacturers—supplying cases to Blancpain, Doxa, and Heuer—Squale is a beloved independent brand producing ultra-capable, vintage-authentic professional divers.",
    "models": [
      {
        "display_name": "1521",
        "search_aliases": [
          "50 atmos",
          "von buren case",
          "matte blue",
          "professional diver"
        ]
      },
      {
        "display_name": "Sub-39",
        "search_aliases": [
          "vintage skin diver",
          "super squale",
          "anniversary"
        ]
      },
      {
        "display_name": "Matic",
        "search_aliases": [
          "squalematic",
          "60 atmos",
          "bakelite bezel",
          "double domed sapphire"
        ]
      }
    ]
  },
  {
    "id": "brand_163",
    "name": "Vostok",
    "founding_snippet": "Founded in 1942 in Chistopol, Russia. Vostok is legendary for outfitting the Soviet military with ultra-rugged, highly utilitarian mechanical watches. They are famous for their unique case engineering, utilizing a two-piece caseback and wobbly crown system designed to increase water resistance under pressure.",
    "models": [
      {
        "display_name": "Amphibia",
        "search_aliases": [
          "amphibian",
          "scuba dude",
          "russian diver",
          "wobbly crown",
          "200m"
        ]
      },
      {
        "display_name": "Komandirskie",
        "search_aliases": [
          "tank dial",
          "kgb",
          "military field",
          "paratrooper",
          "manual wind"
        ]
      }
    ]
  },
  {
    "id": "brand_164",
    "name": "Wempe Glashütte i/SA",
    "founding_snippet": "Founded in 1878 by Gerhard D. Wempe. Originally a prestigious German retailer, Wempe evolved into a formidable manufacturer, reviving the historic Glashütte Observatory to test chronometers and producing highly refined, in-house mechanical timepieces in the Saxon tradition.",
    "models": [
      {
        "display_name": "Iron Walker",
        "search_aliases": [
          "integrated bracelet",
          "german sports watch",
          "diver",
          "chronometer"
        ]
      },
      {
        "display_name": "Zeitmeister",
        "search_aliases": [
          "aviator",
          "classic chronometer",
          "german dress"
        ]
      },
      {
        "display_name": "Chronometerwerke",
        "search_aliases": [
          "in-house caliber",
          "saxon high horology",
          "tonneau"
        ]
      }
    ]
  },
  {
    "id": "brand_165",
    "name": "Unimatic",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_166",
    "name": "Universal Genève",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_167",
    "name": "Valerii Danevych",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_168",
    "name": "Veralux",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_169",
    "name": "Vicent Calabrese",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_170",
    "name": "Vito",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_171",
    "name": "Voutilainen",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_172",
    "name": "Vulcain",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_173",
    "name": "William Massena (Massena LAB)",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_174",
    "name": "Xhevdet Rexhepi",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_175",
    "name": "Yvan Arpa",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_176",
    "name": "Zodiac Watches",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_177",
    "name": "Vyntage Horology",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_178",
    "name": "Waltham Watch Company",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_179",
    "name": "Weis",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_180",
    "name": "Wempe Glashütte",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_181",
    "name": "Wyler Vetta",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_182",
    "name": "Xicorr",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_183",
    "name": "Yonger & Bresson",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_184",
    "name": "Zannetti",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_185",
    "name": "Zelos Watches",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_186",
    "name": "Zeno-Watch Basel",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_187",
    "name": "Zenton",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_188",
    "name": "Zim",
    "founding_snippet": null,
    "models": []
  },
  {
    "id": "brand_189",
    "name": "Askania",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_190",
    "name": "Bamford Watch Department",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_191",
    "name": "Benrus",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_192",
    "name": "Biolley",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_193",
    "name": "Blaken",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_194",
    "name": "Blancpain x Swatch",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_195",
    "name": "Bravur",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_196",
    "name": "Bulova",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_197",
    "name": "Casio",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_198",
    "name": "Cedric Johner",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_199",
    "name": "Certina",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_200",
    "name": "Chanel",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_201",
    "name": "Chopard",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_202",
    "name": "Christopher Ward",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_203",
    "name": "Chronoswiss",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_204",
    "name": "Ciga Design",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_205",
    "name": "Citizen",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_206",
    "name": "Claude Meylan",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_207",
    "name": "Clemence Watches",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_208",
    "name": "Constantin Chaykin",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_209",
    "name": "Corum",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_210",
    "name": "Credor",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_211",
    "name": "Czapek & Cie",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_212",
    "name": "Dan Henry",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_213",
    "name": "Daniel Roth",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_214",
    "name": "David Candaux",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_215",
    "name": "De Bethune",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_216",
    "name": "DeLaneau",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_217",
    "name": "DeWitt",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_218",
    "name": "Direnzo",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_219",
    "name": "Doxa",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_220",
    "name": "Dubey & Schaldenbrand",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_221",
    "name": "Dufrane",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_222",
    "name": "Edward Hornby",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_223",
    "name": "Eterna",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_224",
    "name": "Farer",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_225",
    "name": "Ferdinand Berthoud",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_226",
    "name": "G-Shock",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_227",
    "name": "Gucci",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_228",
    "name": "Haldimann",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_229",
    "name": "Halios",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Blushark",
        "search_aliases": []
      },
      {
        "display_name": "Fairwind",
        "search_aliases": []
      },
      {
        "display_name": "Holotype",
        "search_aliases": []
      },
      {
        "display_name": "Laguna",
        "search_aliases": []
      },
      {
        "display_name": "Puck",
        "search_aliases": []
      },
      {
        "display_name": "Seaforth",
        "search_aliases": []
      },
      {
        "display_name": "Tropik",
        "search_aliases": []
      },
      {
        "display_name": "Universa",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_230",
    "name": "Hamilton",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "American Classic",
        "search_aliases": []
      },
      {
        "display_name": "Khaki Aviation",
        "search_aliases": []
      },
      {
        "display_name": "Khaki Field",
        "search_aliases": []
      },
      {
        "display_name": "Khaki Navy",
        "search_aliases": []
      },
      {
        "display_name": "Jazzmaster",
        "search_aliases": []
      },
      {
        "display_name": "Ventura",
        "search_aliases": []
      },
      {
        "display_name": "Chrono-Matic",
        "search_aliases": []
      },
      {
        "display_name": "Pan Europ",
        "search_aliases": []
      },
      {
        "display_name": "Pulsar",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_231",
    "name": "Harry Winston",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Avenue",
        "search_aliases": []
      },
      {
        "display_name": "Emerald",
        "search_aliases": []
      },
      {
        "display_name": "Midnight",
        "search_aliases": []
      },
      {
        "display_name": "Ocean",
        "search_aliases": []
      },
      {
        "display_name": "Project Z",
        "search_aliases": []
      },
      {
        "display_name": "Opus",
        "search_aliases": []
      },
      {
        "display_name": "Premier",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_232",
    "name": "Heuer",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Autavia",
        "search_aliases": []
      },
      {
        "display_name": "Carrera",
        "search_aliases": []
      },
      {
        "display_name": "Monaco",
        "search_aliases": []
      },
      {
        "display_name": "Camaro",
        "search_aliases": []
      },
      {
        "display_name": "Cortina",
        "search_aliases": []
      },
      {
        "display_name": "Daytona",
        "search_aliases": []
      },
      {
        "display_name": "Jarama",
        "search_aliases": []
      },
      {
        "display_name": "Kentucky",
        "search_aliases": []
      },
      {
        "display_name": "Montreal",
        "search_aliases": []
      },
      {
        "display_name": "Silverstone",
        "search_aliases": []
      },
      {
        "display_name": "Verona",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_233",
    "name": "Ikepod",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Hemipode",
        "search_aliases": []
      },
      {
        "display_name": "Isopode",
        "search_aliases": []
      },
      {
        "display_name": "Megapode",
        "search_aliases": []
      },
      {
        "display_name": "Manatee",
        "search_aliases": []
      },
      {
        "display_name": "Seaslug",
        "search_aliases": []
      },
      {
        "display_name": "Horizon",
        "search_aliases": []
      },
      {
        "display_name": "Duopod",
        "search_aliases": []
      },
      {
        "display_name": "Chronopod",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_234",
    "name": "Incipio",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_235",
    "name": "Invicta",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Pro Diver",
        "search_aliases": []
      },
      {
        "display_name": "Grand Diver",
        "search_aliases": []
      },
      {
        "display_name": "Subaqua",
        "search_aliases": []
      },
      {
        "display_name": "Aviator",
        "search_aliases": []
      },
      {
        "display_name": "Speedway",
        "search_aliases": []
      },
      {
        "display_name": "Russian Diver",
        "search_aliases": []
      },
      {
        "display_name": "Lupah",
        "search_aliases": []
      },
      {
        "display_name": "Angel",
        "search_aliases": []
      },
      {
        "display_name": "Bolt",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_236",
    "name": "Itay Noy",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Chronolove",
        "search_aliases": []
      },
      {
        "display_name": "Duality",
        "search_aliases": []
      },
      {
        "display_name": "Full Month",
        "search_aliases": []
      },
      {
        "display_name": "ID",
        "search_aliases": []
      },
      {
        "display_name": "Identity",
        "search_aliases": []
      },
      {
        "display_name": "Part Time",
        "search_aliases": []
      },
      {
        "display_name": "Seven Days",
        "search_aliases": []
      },
      {
        "display_name": "Time After Time",
        "search_aliases": []
      },
      {
        "display_name": "X-Ray",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_237",
    "name": "Jaquet Droz",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Grande Seconde",
        "search_aliases": []
      },
      {
        "display_name": "Petite Heure Minute",
        "search_aliases": []
      },
      {
        "display_name": "Grande Heure",
        "search_aliases": []
      },
      {
        "display_name": "Ateliers d'Art",
        "search_aliases": []
      },
      {
        "display_name": "Lady 8",
        "search_aliases": []
      },
      {
        "display_name": "The Bird Repeater",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_238",
    "name": "Jean Richard",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Aquascope",
        "search_aliases": []
      },
      {
        "display_name": "Terrascope",
        "search_aliases": []
      },
      {
        "display_name": "Aeroscope",
        "search_aliases": []
      },
      {
        "display_name": "1681",
        "search_aliases": []
      },
      {
        "display_name": "Bressel",
        "search_aliases": []
      },
      {
        "display_name": "TV Screen",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_239",
    "name": "Jean Rousseau",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_240",
    "name": "Julien Coudray",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Competentia",
        "search_aliases": []
      },
      {
        "display_name": "Manuscript",
        "search_aliases": []
      },
      {
        "display_name": "Oatman",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_241",
    "name": "Junghans",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Max Bill",
        "search_aliases": []
      },
      {
        "display_name": "Meister",
        "search_aliases": []
      },
      {
        "display_name": "Form",
        "search_aliases": []
      },
      {
        "display_name": "1972",
        "search_aliases": []
      },
      {
        "display_name": "Bogner",
        "search_aliases": []
      },
      {
        "display_name": "Radio Control",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_242",
    "name": "Kallinich Claeys",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Einser",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_243",
    "name": "Karsten Frässdorf",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Ei8ht",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_244",
    "name": "Kudoke",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Kudoke 1",
        "search_aliases": []
      },
      {
        "display_name": "Kudoke 2",
        "search_aliases": []
      },
      {
        "display_name": "Kudoke 3",
        "search_aliases": []
      },
      {
        "display_name": "Kudoke 5",
        "search_aliases": []
      },
      {
        "display_name": "KudOktopus",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_245",
    "name": "Laco",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Pilot Original",
        "search_aliases": []
      },
      {
        "display_name": "Pilot Basic",
        "search_aliases": []
      },
      {
        "display_name": "Squad",
        "search_aliases": []
      },
      {
        "display_name": "Navy",
        "search_aliases": []
      },
      {
        "display_name": "Classics",
        "search_aliases": []
      },
      {
        "display_name": "Chronographs",
        "search_aliases": []
      },
      {
        "display_name": "Sport",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_246",
    "name": "Le Regulator",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_247",
    "name": "Leinfelder",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Meridian",
        "search_aliases": []
      },
      {
        "display_name": "Chronograph",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_248",
    "name": "Lip",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Mach 2000",
        "search_aliases": []
      },
      {
        "display_name": "Nautic-Ski",
        "search_aliases": []
      },
      {
        "display_name": "Himalaya",
        "search_aliases": []
      },
      {
        "display_name": "Churchill",
        "search_aliases": []
      },
      {
        "display_name": "Dauphine",
        "search_aliases": []
      },
      {
        "display_name": "Henriette",
        "search_aliases": []
      },
      {
        "display_name": "General de Gaulle",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_249",
    "name": "Longines",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Master Collection",
        "search_aliases": []
      },
      {
        "display_name": "Heritage",
        "search_aliases": []
      },
      {
        "display_name": "Spirit",
        "search_aliases": []
      },
      {
        "display_name": "Legend Diver",
        "search_aliases": []
      },
      {
        "display_name": "HydroConquest",
        "search_aliases": []
      },
      {
        "display_name": "Conquest",
        "search_aliases": []
      },
      {
        "display_name": "Ultra-Chron",
        "search_aliases": []
      },
      {
        "display_name": "DolceVita",
        "search_aliases": []
      },
      {
        "display_name": "PrimaLuna",
        "search_aliases": []
      },
      {
        "display_name": "Elegant Collection",
        "search_aliases": []
      },
      {
        "display_name": "Record",
        "search_aliases": []
      },
      {
        "display_name": "Flagship",
        "search_aliases": []
      },
      {
        "display_name": "Evidenza",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_250",
    "name": "Lorier",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Neptune",
        "search_aliases": []
      },
      {
        "display_name": "Falcon",
        "search_aliases": []
      },
      {
        "display_name": "Hydra",
        "search_aliases": []
      },
      {
        "display_name": "Hyperion",
        "search_aliases": []
      },
      {
        "display_name": "Gemini",
        "search_aliases": []
      },
      {
        "display_name": "Zephyr",
        "search_aliases": []
      },
      {
        "display_name": "Safari",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_251",
    "name": "Louis Erard x Alain Silberstein",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_252",
    "name": "Louis Erard x Konstantin Chaykin",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_253",
    "name": "Louis Erard x Massena LAB",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_254",
    "name": "Louis Erard x seconde/seconde",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_255",
    "name": "Lucian Piccard",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Strasburg",
        "search_aliases": []
      },
      {
        "display_name": "Verona",
        "search_aliases": []
      },
      {
        "display_name": "Breckenridge",
        "search_aliases": []
      },
      {
        "display_name": "Monte Carlo",
        "search_aliases": []
      },
      {
        "display_name": "Pegasus",
        "search_aliases": []
      },
      {
        "display_name": "Amalfi",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_256",
    "name": "Ludovic Ballouard",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Upside Down",
        "search_aliases": []
      },
      {
        "display_name": "Half Time",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_257",
    "name": "M.A.D.Edition",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "M.A.D.1",
        "search_aliases": []
      },
      {
        "display_name": "M.A.D.2",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_258",
    "name": "MB&F x H. Moser",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_259",
    "name": "MB&F x L'Epée",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_260",
    "name": "Magrette",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Moana Pacific",
        "search_aliases": []
      },
      {
        "display_name": "Regattare",
        "search_aliases": []
      },
      {
        "display_name": "Waterman",
        "search_aliases": []
      },
      {
        "display_name": "Leoncino",
        "search_aliases": []
      },
      {
        "display_name": "Dual Time",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_261",
    "name": "Marc Newson",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Pod",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_262",
    "name": "Marco Lang",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Zwei",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_263",
    "name": "Marnaut",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Dark Surge",
        "search_aliases": []
      },
      {
        "display_name": "Safe Harbor",
        "search_aliases": []
      },
      {
        "display_name": "Seascape",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_264",
    "name": "Martin Braun",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "EOS",
        "search_aliases": []
      },
      {
        "display_name": "Boreas",
        "search_aliases": []
      },
      {
        "display_name": "Helios",
        "search_aliases": []
      },
      {
        "display_name": "Selene",
        "search_aliases": []
      },
      {
        "display_name": "Teutonia",
        "search_aliases": []
      },
      {
        "display_name": "Astraios",
        "search_aliases": []
      },
      {
        "display_name": "Notos",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_265",
    "name": "Massena LAB",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Uni-Racer",
        "search_aliases": []
      },
      {
        "display_name": "Archetype",
        "search_aliases": []
      },
      {
        "display_name": "Geometer",
        "search_aliases": []
      },
      {
        "display_name": "Magraph",
        "search_aliases": []
      },
      {
        "display_name": "Chronograph Monopoussoir",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_266",
    "name": "Maurice de Mauriac",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Chrono Modern",
        "search_aliases": []
      },
      {
        "display_name": "Automatic Modern",
        "search_aliases": []
      },
      {
        "display_name": "Big Date",
        "search_aliases": []
      },
      {
        "display_name": "Züri Date",
        "search_aliases": []
      },
      {
        "display_name": "Diver",
        "search_aliases": []
      },
      {
        "display_name": "L1",
        "search_aliases": []
      },
      {
        "display_name": "L2",
        "search_aliases": []
      },
      {
        "display_name": "L3",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_267",
    "name": "Merkur",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "FOD",
        "search_aliases": []
      },
      {
        "display_name": "Ocean Star",
        "search_aliases": []
      },
      {
        "display_name": "Pierre Paulin",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_268",
    "name": "Microma",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "LCD Digital",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_269",
    "name": "Milus",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Archimèdes",
        "search_aliases": []
      },
      {
        "display_name": "Snow Star",
        "search_aliases": []
      },
      {
        "display_name": "LAB 01",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_270",
    "name": "Moonswatch",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_271",
    "name": "NBY",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Charlie",
        "search_aliases": []
      },
      {
        "display_name": "Delta",
        "search_aliases": []
      },
      {
        "display_name": "Tango",
        "search_aliases": []
      },
      {
        "display_name": "Lima",
        "search_aliases": []
      },
      {
        "display_name": "ILS",
        "search_aliases": []
      },
      {
        "display_name": "Tendence",
        "search_aliases": []
      },
      {
        "display_name": "Radial Engine",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_272",
    "name": "Nezumi",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Voiture",
        "search_aliases": []
      },
      {
        "display_name": "Baleine",
        "search_aliases": []
      },
      {
        "display_name": "Tonnerre",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_273",
    "name": "Nienaber",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "King Size",
        "search_aliases": []
      },
      {
        "display_name": "Antero",
        "search_aliases": []
      },
      {
        "display_name": "Retro",
        "search_aliases": []
      },
      {
        "display_name": "Retrolator",
        "search_aliases": []
      },
      {
        "display_name": "Decimal",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_274",
    "name": "Ollech & Wajs",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Caribbean",
        "search_aliases": []
      },
      {
        "display_name": "Navichron",
        "search_aliases": []
      },
      {
        "display_name": "Selectron",
        "search_aliases": []
      },
      {
        "display_name": "Mirage",
        "search_aliases": []
      },
      {
        "display_name": "Early Bird",
        "search_aliases": []
      },
      {
        "display_name": "P-101",
        "search_aliases": []
      },
      {
        "display_name": "C-101",
        "search_aliases": []
      },
      {
        "display_name": "M-110",
        "search_aliases": []
      },
      {
        "display_name": "OW S",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_275",
    "name": "Omega x Swatch (MoonSwatch)",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Mission to the Moon",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Mars",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Earth",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Venus",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Saturn",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Jupiter",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Mercury",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Uranus",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Neptune",
        "search_aliases": []
      },
      {
        "display_name": "Mission to Pluto",
        "search_aliases": []
      },
      {
        "display_name": "Mission to the Sun",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_276",
    "name": "Ondrej Berkus",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_277",
    "name": "Patria Watch Co.",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Brigadier",
        "search_aliases": []
      },
      {
        "display_name": "Aviator",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_278",
    "name": "Pegasus Watches",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Antea",
        "search_aliases": []
      },
      {
        "display_name": "Mariner",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_279",
    "name": "Pequignet",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Rue Royale",
        "search_aliases": []
      },
      {
        "display_name": "Royal Manuel",
        "search_aliases": []
      },
      {
        "display_name": "Attitude",
        "search_aliases": []
      },
      {
        "display_name": "Excentrique",
        "search_aliases": []
      },
      {
        "display_name": "Moorea",
        "search_aliases": []
      },
      {
        "display_name": "Elegance",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_280",
    "name": "Pierre DeRoche",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "TNT",
        "search_aliases": []
      },
      {
        "display_name": "GrandCliff",
        "search_aliases": []
      },
      {
        "display_name": "SplitRock",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_281",
    "name": "Poljot",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Aviator",
        "search_aliases": []
      },
      {
        "display_name": "Burran",
        "search_aliases": []
      },
      {
        "display_name": "Chronograph",
        "search_aliases": []
      },
      {
        "display_name": "De Luxe",
        "search_aliases": []
      },
      {
        "display_name": "Ocean",
        "search_aliases": []
      },
      {
        "display_name": "Navigator",
        "search_aliases": []
      },
      {
        "display_name": "Shturmanskie",
        "search_aliases": []
      },
      {
        "display_name": "Strela",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_282",
    "name": "ProTek",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Series 1000 Tactical",
        "search_aliases": []
      },
      {
        "display_name": "Series 2000 Dive",
        "search_aliases": []
      },
      {
        "display_name": "Series 3000 Field",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_283",
    "name": "Pulsar",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Calculator",
        "search_aliases": []
      },
      {
        "display_name": "Digital",
        "search_aliases": []
      },
      {
        "display_name": "Kinetic",
        "search_aliases": []
      },
      {
        "display_name": "P2",
        "search_aliases": []
      },
      {
        "display_name": "P3",
        "search_aliases": []
      },
      {
        "display_name": "Sport",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_284",
    "name": "Q Timex",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Chronograph",
        "search_aliases": []
      },
      {
        "display_name": "Falcon Eye",
        "search_aliases": []
      },
      {
        "display_name": "GMT",
        "search_aliases": []
      },
      {
        "display_name": "M79",
        "search_aliases": []
      },
      {
        "display_name": "Reissue",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_285",
    "name": "RUF",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_286",
    "name": "Raidillon",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Chronograph",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_287",
    "name": "Raketa",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Avant-Garde",
        "search_aliases": []
      },
      {
        "display_name": "Big Zero",
        "search_aliases": []
      },
      {
        "display_name": "Copernicus",
        "search_aliases": []
      },
      {
        "display_name": "Polar",
        "search_aliases": []
      },
      {
        "display_name": "Sonar",
        "search_aliases": []
      },
      {
        "display_name": "Submarine",
        "search_aliases": []
      },
      {
        "display_name": "Tupolev",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_288",
    "name": "Rexhep Rexhepi",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Chronomètre Contemporain",
        "search_aliases": []
      },
      {
        "display_name": "Chronomètre Antimagnétique",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_289",
    "name": "Roger W. Smith",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Series 1",
        "search_aliases": []
      },
      {
        "display_name": "Series 2",
        "search_aliases": []
      },
      {
        "display_name": "Series 3",
        "search_aliases": []
      },
      {
        "display_name": "Series 4",
        "search_aliases": []
      },
      {
        "display_name": "Series 5",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_290",
    "name": "Sandoz",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Submariner",
        "search_aliases": []
      },
      {
        "display_name": "Explorer",
        "search_aliases": []
      },
      {
        "display_name": "Day-Date",
        "search_aliases": []
      },
      {
        "display_name": "Monaco",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_291",
    "name": "Sartory Billard",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "SB02",
        "search_aliases": []
      },
      {
        "display_name": "SB03",
        "search_aliases": []
      },
      {
        "display_name": "SB04",
        "search_aliases": []
      },
      {
        "display_name": "SB05",
        "search_aliases": []
      },
      {
        "display_name": "SB07",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_292",
    "name": "Schofield",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Signalman",
        "search_aliases": []
      },
      {
        "display_name": "Beating Heart",
        "search_aliases": []
      },
      {
        "display_name": "Bronze Beating Heart",
        "search_aliases": []
      },
      {
        "display_name": "The Obscura",
        "search_aliases": []
      },
      {
        "display_name": "Strange Lights",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_293",
    "name": "Schwarz Etienne",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Roma",
        "search_aliases": []
      },
      {
        "display_name": "Rosario",
        "search_aliases": []
      },
      {
        "display_name": "Fiji",
        "search_aliases": []
      },
      {
        "display_name": "Ode au Printemps",
        "search_aliases": []
      },
      {
        "display_name": "La Chaux-de-Fonds",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_294",
    "name": "Sea-Gull",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "1963",
        "search_aliases": []
      },
      {
        "display_name": "Ocean Star",
        "search_aliases": []
      },
      {
        "display_name": "Business Pioneer",
        "search_aliases": []
      },
      {
        "display_name": "Dragon King",
        "search_aliases": []
      },
      {
        "display_name": "WuYi",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_295",
    "name": "Serica",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "4512",
        "search_aliases": []
      },
      {
        "display_name": "5303",
        "search_aliases": []
      },
      {
        "display_name": "6190",
        "search_aliases": []
      },
      {
        "display_name": "8315",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_296",
    "name": "Sherpa Watches",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Sherpa OPS",
        "search_aliases": []
      },
      {
        "display_name": "Sherpa Ultradive",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_297",
    "name": "Shinola",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Runwell",
        "search_aliases": []
      },
      {
        "display_name": "Canfield",
        "search_aliases": []
      },
      {
        "display_name": "Shinola Monster",
        "search_aliases": []
      },
      {
        "display_name": "Birdy",
        "search_aliases": []
      },
      {
        "display_name": "Derby",
        "search_aliases": []
      },
      {
        "display_name": "Vinton",
        "search_aliases": []
      },
      {
        "display_name": "Detrola",
        "search_aliases": []
      },
      {
        "display_name": "Duck",
        "search_aliases": []
      },
      {
        "display_name": "Traveler",
        "search_aliases": []
      },
      {
        "display_name": "Circadian",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_298",
    "name": "Smiths",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Military",
        "search_aliases": []
      },
      {
        "display_name": "Everest",
        "search_aliases": []
      },
      {
        "display_name": "Everest Expedition",
        "search_aliases": []
      },
      {
        "display_name": "Commander 71",
        "search_aliases": []
      },
      {
        "display_name": "W.W.W.",
        "search_aliases": []
      },
      {
        "display_name": "Traveller",
        "search_aliases": []
      },
      {
        "display_name": "Trans-Global",
        "search_aliases": []
      },
      {
        "display_name": "Navigator",
        "search_aliases": []
      },
      {
        "display_name": "Caribbean 1000",
        "search_aliases": []
      },
      {
        "display_name": "Baby Willard",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_299",
    "name": "Solios",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Solar Classic",
        "search_aliases": []
      },
      {
        "display_name": "Solar Curve",
        "search_aliases": []
      },
      {
        "display_name": "Solar Mini",
        "search_aliases": []
      },
      {
        "display_name": "Sunseeker",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_300",
    "name": "Struthers Watchmakers",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Kingsley",
        "search_aliases": []
      },
      {
        "display_name": "Project 248",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_301",
    "name": "Sufian",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_302",
    "name": "Sully",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Sully Special",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_303",
    "name": "Suunto",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Essential",
        "search_aliases": []
      },
      {
        "display_name": "Core",
        "search_aliases": []
      },
      {
        "display_name": "Elementum",
        "search_aliases": []
      },
      {
        "display_name": "Kailash",
        "search_aliases": []
      },
      {
        "display_name": "Spartan",
        "search_aliases": []
      },
      {
        "display_name": "Suunto 3",
        "search_aliases": []
      },
      {
        "display_name": "Suunto 5",
        "search_aliases": []
      },
      {
        "display_name": "Suunto 7",
        "search_aliases": []
      },
      {
        "display_name": "Suunto 9",
        "search_aliases": []
      },
      {
        "display_name": "Race",
        "search_aliases": []
      },
      {
        "display_name": "Vertical",
        "search_aliases": []
      },
      {
        "display_name": "Ocean",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_304",
    "name": "Swarovski",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Octea",
        "search_aliases": []
      },
      {
        "display_name": "Crystalline",
        "search_aliases": []
      },
      {
        "display_name": "Aila",
        "search_aliases": []
      },
      {
        "display_name": "Lovely Crystals",
        "search_aliases": []
      },
      {
        "display_name": "Passage",
        "search_aliases": []
      },
      {
        "display_name": "Cosmopolitan",
        "search_aliases": []
      },
      {
        "display_name": "Attract",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_305",
    "name": "Swatch",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Originals",
        "search_aliases": []
      },
      {
        "display_name": "Irony",
        "search_aliases": []
      },
      {
        "display_name": "Skin",
        "search_aliases": []
      },
      {
        "display_name": "Digital",
        "search_aliases": []
      },
      {
        "display_name": "Bioceramic",
        "search_aliases": []
      },
      {
        "display_name": "Big Bold",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_306",
    "name": "Sylvain Pinaud",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Origine",
        "search_aliases": []
      },
      {
        "display_name": "Chronomètre Artisanal",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_307",
    "name": "TAG Heuer x Porsche",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Carrera",
        "search_aliases": []
      },
      {
        "display_name": "Connected",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_308",
    "name": "TW Steel",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Canteen",
        "search_aliases": []
      },
      {
        "display_name": "Volante",
        "search_aliases": []
      },
      {
        "display_name": "Grandeur",
        "search_aliases": []
      },
      {
        "display_name": "Ace",
        "search_aliases": []
      },
      {
        "display_name": "Fast Lane",
        "search_aliases": []
      },
      {
        "display_name": "CEO",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_309",
    "name": "Takashi",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_310",
    "name": "Tan Zehua",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Rainbow",
        "search_aliases": []
      },
      {
        "display_name": "Melody",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_311",
    "name": "Thomas Prescher",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Tempus Vivendi",
        "search_aliases": []
      },
      {
        "display_name": "Nemo",
        "search_aliases": []
      },
      {
        "display_name": "Sculptura",
        "search_aliases": []
      },
      {
        "display_name": "Mystérieuse",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_312",
    "name": "Traska",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Commuter",
        "search_aliases": []
      },
      {
        "display_name": "Freediver",
        "search_aliases": []
      },
      {
        "display_name": "Seafarer",
        "search_aliases": []
      },
      {
        "display_name": "Summiteer",
        "search_aliases": []
      },
      {
        "display_name": "Venturer",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_313",
    "name": "Tudor x Marine Nationale",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Submariner",
        "search_aliases": []
      },
      {
        "display_name": "Pelagos",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_314",
    "name": "Twelve",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_315",
    "name": "Vanguard",
    "founding_snippet": "",
    "models": []
  },
  {
    "id": "brand_316",
    "name": "Vortic",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "The American Artisan Series",
        "search_aliases": []
      },
      {
        "display_name": "The Military Edition",
        "search_aliases": []
      },
      {
        "display_name": "The Railroad Edition",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_317",
    "name": "Welsbro",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Chrono",
        "search_aliases": []
      },
      {
        "display_name": "Grape Soda",
        "search_aliases": []
      },
      {
        "display_name": "Lemon Soda",
        "search_aliases": []
      },
      {
        "display_name": "Cherry Soda",
        "search_aliases": []
      },
      {
        "display_name": "Overtime",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_318",
    "name": "William Wood",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "The Valiant",
        "search_aliases": []
      },
      {
        "display_name": "The Chivalrous",
        "search_aliases": []
      },
      {
        "display_name": "The Triumph",
        "search_aliases": []
      },
      {
        "display_name": "The Fearless",
        "search_aliases": []
      }
    ]
  },
  {
    "id": "brand_319",
    "name": "Wittnauer",
    "founding_snippet": "",
    "models": [
      {
        "display_name": "Professional",
        "search_aliases": []
      },
      {
        "display_name": "Chrono-Chieftain",
        "search_aliases": []
      },
      {
        "display_name": "Super Sport",
        "search_aliases": []
      },
      {
        "display_name": "Electro-Chron",
        "search_aliases": []
      },
      {
        "display_name": "Geneve",
        "search_aliases": []
      },
      {
        "display_name": "2002",
        "search_aliases": []
      }
    ]
  }
];
