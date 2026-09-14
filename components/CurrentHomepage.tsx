'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { buildBrowseSearchHref } from '@/lib/nav/headerSearch';

/* ════════════════════════════════════════════════════════════════════════
   HOMEPAGE BODY — the pre-inventory runway.

   WHAT THIS PAGE IS FOR. There is not yet enough published inventory to let
   watches carry the front door, so the homepage leads with the METHOD
   instead: how FairWatchTrade is searched. The headline promises a way of
   looking, never marketplace depth — an inventory promise the catalogue
   cannot currently keep is the one thing this composition must not make.
   When real watches can carry the room, the opening becomes inventory-led
   and this runway gives way to it.

   THIS FILE OWNS THE BODY ONLY. NavBar, MarketBar and SiteFooter are mounted
   once by app/layout.tsx and are never reproduced here — a second masthead
   or a second metals strip is the failure mode this note exists to prevent.
   The compact header search is deliberately absent on "/" (see
   headerSearchVisible in lib/nav/headerSearch.ts): the homepage owns one
   large search in its body, so the page never carries two search fields.

   THE SEARCH IS REAL. The field below is a new PLACEMENT of the existing
   search mechanism, not a second one. It submits through
   buildBrowseSearchHref into /browse?q=, where Browse's parser, URL state,
   Active Criteria and result machinery take over. No local parsing, no
   reference interpretation, no fuzzy matching, no results overlay — the
   example strings in the hint are demonstration copy, never fixtures.

   THE CLOCK IS REAL TIME. It reads the visitor's local clock and updates
   every second; the hand angles below are computed, never decorative
   constants. It is the hinge between the discovery room and the runway. It
   is aria-hidden on purpose: it carries no information the page depends on,
   and a label that silently went stale every second would be worse than
   silence.

   APPEARANCE. The light composition is the designed one, so every custom
   value is written light-dark(light, dark) rather than forcing the page to
   one appearance. Shared tokens are used wherever one exists; functional
   text sits at --muted or brighter under the readability floor, which is why
   a few values here are a shade stronger than the light comp.
   ════════════════════════════════════════════════════════════════════════ */

/* The pale runway. This exact light value is the approved room colour; the
   dark arm is the ordinary page ink so the room still reads as a distinct
   plane beneath the lighter search room above it. */
const RUNWAY_SURFACE = 'light-dark(#F2F0E9, #0D0F14)';
const RUNWAY_RULE = 'light-dark(rgba(188,169,131,1), rgba(201,168,76,0.22))';

const PRINCIPLES = [
  { mark: '♢', label: 'Mechanical timepieces only' },
  { mark: '⌁', label: 'Watches chosen for merit' },
  { mark: '⌾', label: 'Original photography' },
] as const;

const PROOF = [
  {
    index: '01 / CAPITAL',
    heading: ['5% flat fee.', 'No games.'],
    copy:
      'Keep more of your collection working for you instead of surrendering it to commissions, promoted placement, and marketplace friction.',
  },
  {
    index: '02 / TRUST',
    heading: ['The actual watch.', 'Not a stock photo.'],
    /* Public language for the photograph-credibility system. It promises
       quiet evidence checking and human review — never detection, never
       automatic rejection, never a claim about what was proven. */
    copy:
      'Listings are built around photographs of the watch actually being offered. We quietly check those images for signs they may have been reused or sourced elsewhere, and anything questionable is held for human review.',
  },
  {
    index: '03 / DISCOVERY',
    heading: ['Search the way', 'you think.'],
    copy:
      'Reference, movement, complication, dial, case — the details that distinguish one watch from the next belong at the center of discovery.',
  },
] as const;

/* Each is a promise the current product actually keeps. "No tracking
   cookies" is deliberately not "no cookies": authentication, session and the
   appearance preference all set cookies, and the Privacy Policy says so. */
const QUIET_PRINCIPLES = [
  'No tracking cookies',
  'No ads. Ever.',
  'No manufactured urgency',
  'No buyer-facing scores',
  'No stock photography',
] as const;

/* Hands are positioned from the centre and extend to the right, so zero
   degrees points at three o'clock and every angle carries the -90 that puts
   twelve at the top. */
function handAngles(now: Date) {
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  return {
    hour: hours * 30 + minutes * 0.5 - 90,
    minute: minutes * 6 + seconds * 0.1 - 90,
    second: seconds * 6 - 90,
  };
}

export default function CurrentHomepage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  /* Server and first client paint agree on twelve o'clock; the effect
     replaces it with real local time immediately after mount. */
  const [hands, setHands] = useState({ hour: -90, minute: -90, second: -90 });

  useEffect(() => {
    function tick() {
      setHands(handAngles(new Date()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    /* The one submit seam. Empty or whitespace text reaches bare /browse
       rather than an empty q — that behaviour belongs to the helper. */
    router.push(buildBrowseSearchHref(query));
  }

  return (
    <main className="relative flex flex-col">

      {/* ── SEARCH ROOM ─────────────────────────────────────────────────
          The instrument comes first. Everything below it explains why. ── */}
      <section
        className="min-h-[610px] px-[22px] pb-12 pt-[54px] text-center min-[821px]:min-h-[650px] min-[821px]:px-[7vw] min-[821px]:pb-14 min-[821px]:pt-[70px]"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <h1
          className="mx-auto max-w-[980px] font-display text-[39px] font-normal uppercase leading-[0.95] tracking-[-0.035em] text-[var(--platinum)] min-[541px]:text-[clamp(34px,4.35vw,68px)]"
        >
          Search the way
          <br />
          you think
        </h1>

        <p className="mx-auto mt-6 max-w-[600px] font-display text-[16px] leading-[1.45] text-[var(--slate)] min-[541px]:text-[18px]">
          Reference, movement, complication, dial, case — start with what actually distinguishes
          the watch.
        </p>

        <form
          onSubmit={submitSearch}
          role="search"
          className="mx-auto mt-[34px] grid h-[50px] w-full max-w-[740px] grid-cols-[1fr_44px]"
          style={{
            border: '1px solid var(--border-mid)',
            background: 'light-dark(#FFFFFF, #1A1D26)',
          }}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search watches"
            placeholder="Brand, reference, complication..."
            className="min-w-0 border-0 bg-transparent px-[18px] font-display text-[16px] text-[var(--platinum)] outline-none placeholder:text-[var(--void)]"
          />
          <button
            type="submit"
            aria-label="Search"
            className="text-[22px] leading-none text-[var(--muted)] transition-colors hover:text-[var(--platinum)]"
            style={{ borderLeft: '1px solid var(--border-faint)' }}
          >
            &#8981;
          </button>
        </form>

        <p className="mt-[13px] font-display text-[13px] italic text-[var(--muted)]">
          Try <span className="not-italic text-[var(--gold)]">&ldquo;mother of pearl moonphase&rdquo;</span> or a
          reference like <span className="not-italic text-[var(--gold)]">&ldquo;PFC274&rdquo;</span>
        </p>

        <div className="mx-auto mt-[52px] grid max-w-[740px] grid-cols-[1fr_auto_1fr] items-center gap-[18px] min-[541px]:mt-[74px]">
          <span className="h-px" style={{ background: 'var(--border-mid)' }} />
          <span className="font-display text-[13px] text-[var(--muted)]">
            Every watch on FairWatchTrade is curated for you — the buyer.
          </span>
          <span className="h-px" style={{ background: 'var(--border-mid)' }} />
        </div>

        <div className="mx-auto mt-[26px] grid max-w-[760px] grid-cols-1 gap-[14px] min-[541px]:grid-cols-3 min-[541px]:gap-[18px] min-[821px]:gap-9">
          {PRINCIPLES.map((principle) => (
            <div key={principle.label} className="font-display text-[12px] text-[var(--slate)]">
              <div
                aria-hidden="true"
                /* The mark anchors an item in the horizontal three-across
                   composition. Once the row stacks it has nothing to anchor
                   against and reads as a stray formatting character, so below
                   541px it is removed outright rather than replaced — display
                   none takes its 34px box and margin with it, leaving the
                   labels to space themselves. */
                className="mb-1 hidden h-[34px] place-items-center text-[30px] leading-none text-[var(--gold)] min-[541px]:grid"
              >
                {principle.mark}
              </div>
              <div>{principle.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── RUNWAY ──────────────────────────────────────────────────────
          Height is content-driven on purpose. The room ends when its last
          line ends and the real footer follows; it is never padded out to a
          fixed height, which is what turns a composed room into a blank
          landing strip. ── */}
      <section
        className="relative overflow-hidden"
        style={{ background: RUNWAY_SURFACE, borderTop: '1px solid var(--border-gold)' }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, light-dark(rgba(255,255,255,0.18), rgba(255,255,255,0.03)), transparent 160px), radial-gradient(circle at 50% 22%, light-dark(rgba(255,255,255,0.22), rgba(255,255,255,0.04)), transparent 42%)',
          }}
        />

        <div className="relative z-[1] mx-auto max-w-[1260px] px-[22px] pb-[86px] pt-[74px] min-[821px]:px-[7vw] min-[821px]:pb-[110px] min-[821px]:pt-24">

          <div className="mb-11 flex justify-center">
            <div
              aria-hidden="true"
              className="relative h-[152px] w-[152px] rounded-full font-display"
              style={{
                border: '1px solid var(--border-gold)',
                background: 'light-dark(rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                boxShadow:
                  'inset 0 0 0 6px light-dark(rgba(255,255,255,0.10), rgba(255,255,255,0.03)), inset 0 0 0 7px light-dark(rgba(143,116,64,0.10), rgba(201,168,76,0.07))',
              }}
            >
              <span
                className="absolute inset-[11px] rounded-full"
                style={{ border: '1px solid var(--border-faint)' }}
              />

              <span className="absolute left-1/2 top-[15px] -translate-x-1/2 text-[10px] leading-none text-[var(--gold-dim)]">XII</span>
              <span className="absolute right-[17px] top-1/2 -translate-y-1/2 text-[10px] leading-none text-[var(--gold-dim)]">III</span>
              <span className="absolute bottom-[15px] left-1/2 -translate-x-1/2 text-[10px] leading-none text-[var(--gold-dim)]">VI</span>
              <span className="absolute left-[17px] top-1/2 -translate-y-1/2 text-[10px] leading-none text-[var(--gold-dim)]">IX</span>

              {[60, 120, 240, 300].map((angle) => (
                <span
                  key={angle}
                  className="absolute left-1/2 top-[7px] h-[7px] w-px"
                  style={{
                    background: 'var(--gold-subtle)',
                    transformOrigin: '50% 69px',
                    transform: `rotate(${angle}deg)`,
                  }}
                />
              ))}

              <span
                className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[6px] tracking-[0.18em] text-[var(--gold-subtle)]"
              >
                FAIRWATCHTRADE
              </span>

              <span
                className="absolute left-1/2 top-1/2 h-px w-[39px]"
                style={{
                  background: 'var(--slate)',
                  transformOrigin: '0 50%',
                  transform: `rotate(${hands.hour}deg)`,
                }}
              />
              <span
                className="absolute left-1/2 top-1/2 h-px w-[52px]"
                style={{
                  background: 'var(--muted)',
                  transformOrigin: '0 50%',
                  transform: `rotate(${hands.minute}deg)`,
                }}
              />
              <span
                className="absolute left-1/2 top-1/2 h-px w-[57px]"
                style={{
                  background: 'var(--gold)',
                  transformOrigin: '0 50%',
                  transform: `rotate(${hands.second}deg)`,
                }}
              />
              <span
                className="absolute left-1/2 top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background: 'var(--gold-fill)',
                  boxShadow: '0 0 0 2px light-dark(rgba(255,255,255,0.35), rgba(255,255,255,0.10))',
                }}
              />
            </div>
          </div>

          <div className="mb-[22px] text-center text-[11px] uppercase tracking-[0.24em] text-[var(--gold-dim)]">
            Why FairWatchTrade exists
          </div>

          <h2 className="mx-auto max-w-[960px] text-center font-display text-[42px] font-normal leading-[0.98] tracking-[-0.035em] text-[var(--platinum)] min-[541px]:text-[clamp(36px,5.2vw,74px)]">
            Built for the watch nobody else recognizes —{' '}
            <em className="font-normal italic text-[var(--platinum-dim)]">and the one person who does.</em>
          </h2>

          <p className="mx-auto mt-[30px] max-w-[720px] text-center font-display text-[17px] leading-[1.55] text-[var(--slate)] min-[541px]:text-[18px]">
            Most watch marketplaces are built around inventory. FairWatchTrade is built around
            recognition: the reference, the movement, the dial, the details you actually care about.
          </p>

          <div
            className="mt-[62px] grid grid-cols-1 min-[541px]:mt-[90px] min-[821px]:grid-cols-3"
            style={{ borderTop: `1px solid ${RUNWAY_RULE}`, borderBottom: `1px solid ${RUNWAY_RULE}` }}
          >
            {/* Alignment belongs to the BLOCK, not to its parts. Stacked, each
                proof is a single centred editorial unit — index, heading and
                copy together — so the alignment is declared once on the article
                and inherited. In the three-column mode it returns to left,
                where the index is a column header and the copy runs against a
                shared left edge. The section rules between blocks are
                unaffected either way. */}
            {PROOF.map((column, index) => (
              <article
                key={column.index}
                className="px-1 py-[30px] text-center min-[821px]:min-h-[224px] min-[821px]:px-[34px] min-[821px]:pb-[34px] min-[821px]:pt-[38px] min-[821px]:text-left"
                style={
                  index === 0
                    ? undefined
                    : { borderTop: `1px solid ${RUNWAY_RULE}`, borderLeft: 'none' }
                }
              >
                <div className="mb-[26px] text-[10px] tracking-[0.18em] text-[var(--gold-dim)]">
                  {column.index}
                </div>
                <h3 className="font-display text-[28px] font-normal leading-[1.08] text-[var(--platinum)]">
                  {column.heading[0]}
                  <br />
                  {column.heading[1]}
                </h3>
                {/* The 30ch measure is kept at every width; centring the text
                    inside a box that stayed left would leave the paragraph
                    visibly off-axis, so the box itself centres while stacked
                    and returns to the left edge in the column mode. */}
                <p className="mx-auto mt-4 max-w-[30ch] font-display text-[15px] leading-[1.55] text-[var(--slate)] min-[821px]:mx-0">
                  {column.copy}
                </p>
              </article>
            ))}
          </div>

          <div className="mx-auto mt-[92px] grid max-w-[970px] grid-cols-1 items-center gap-[18px] min-[821px]:grid-cols-[1fr_auto_1fr] min-[821px]:gap-7">
            <span className="hidden h-px min-[821px]:block" style={{ background: 'var(--border-gold)' }} />
            <blockquote className="mx-auto max-w-[680px] text-center font-display text-[23px] italic leading-[1.35] text-[var(--platinum-dim)]">
              &ldquo;We think in dials and VPH, not dropdowns.&rdquo;
            </blockquote>
            <span className="hidden h-px min-[821px]:block" style={{ background: 'var(--border-gold)' }} />
          </div>

          <div className="mx-auto mt-[68px] flex max-w-[850px] flex-wrap justify-center gap-x-[22px] gap-y-4 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] min-[541px]:gap-9">
            {QUIET_PRINCIPLES.map((principle) => (
              <span key={principle} className="relative pl-[14px]">
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
                  style={{ background: 'var(--gold-fill)' }}
                />
                {principle}
              </span>
            ))}
          </div>

        </div>
      </section>

    </main>
  );
}
