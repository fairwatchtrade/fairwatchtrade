import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseSearch } from "@/lib/search/parse.ts";
import {
  GOVERNED_KEYS,
  GOVERNED_MAX_WORDS,
} from "@/lib/search/server/vaultTaxonomy.generated.ts";

/* ════════════════════════════════════════════════════════════════════════
   GOVERNED SEARCH RESOLUTION — SFX-006B

   Browse resolves its query HERE rather than in the browser, for one reason:
   the governed taxonomy carries the curated alias corpus, and that corpus does
   not ship inside the client bundle (v6.86 protected-alias posture — the same
   ruling that moved Galaxy alias matching to app/api/vault/galaxy-search).

   This route returns the RESOLVED MEANINGS ONLY — never the dictionary. A
   visitor can ask "what does this phrase mean?" one query at a time; a visitor
   cannot download the taxonomy.

   It is the same parseSearch the client already runs, handed the taxonomy the
   client cannot have. Exact-identifier precedence is therefore identical by
   construction rather than by a second implementation that could drift:
   listing code, then exact known reference, then identifier-shaped exact
   request, and only then governed taxonomy.

   `knownReferences` is resolved server-side from published listings so that
   exact-reference behaviour matches what Browse itself sees. Without it the
   route would answer differently from the client for a bare reference query.

   NO AUTH by design: Browse is anonymously reachable, so its search must be.
   Reads nothing but published listing references and a static artifact.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const taxonomy = { keys: GOVERNED_KEYS, maxWords: GOVERNED_MAX_WORDS };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json(parseSearch("", { taxonomy }));
  }

  let knownReferences: string[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("listings")
      .select("reference")
      .eq("status", "published")
      .limit(1000);
    knownReferences = (data ?? [])
      .map((r: { reference: string | null }) => r.reference)
      .filter((r): r is string => typeof r === "string" && r.trim() !== "");
  } catch {
    /* A reference lookup failure must not turn a governed query into an error
       page. Resolution proceeds without it: the query then behaves exactly as
       it did before this round for the reference step, which is honest
       degradation rather than a wrong answer. */
    knownReferences = [];
  }

  const state = parseSearch(q, { taxonomy, knownReferences });
  return NextResponse.json(state, {
    headers: { "cache-control": "no-store" },
  });
}
