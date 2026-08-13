/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — PROVIDER ROLES (server-only)

   The smallest role contract the composition pipeline needs: two named
   roles, one request shape, JSON-reliability and truncation handling, and
   usage/model metadata for the internal audit trail. Deliberately NOT a
   general AI orchestration platform — no routing, no voting, no fallback
   chains, no confidence.

   INDEPENDENCE LIVES IN THE PACKET CONTRACT, not in provider diversity:
   the verifier receives claims + finished prose, never the composer's
   reasoning. Both roles may share a provider family; what they never share
   is information.

   Provider identity is internal audit metadata and never renders in
   reader-facing content.
   ════════════════════════════════════════════════════════════════════════ */

export type DossierRole = "dossier_composer" | "dossier_verifier";

export type RoleCallResult = {
  text: string;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string | null;
};

export class RoleUnavailableError extends Error {
  readonly role: DossierRole;
  constructor(role: DossierRole, detail: string) {
    super(`${role} unavailable: ${detail}`);
    this.name = "RoleUnavailableError";
    this.role = role;
  }
}

const PROVIDER = "anthropic";
const MODEL = "claude-opus-5";
const API_URL = "https://api.anthropic.com/v1/messages";

export type RoleCaller = (
  role: DossierRole,
  request: { system: string; user: string; maxTokens: number }
) => Promise<RoleCallResult>;

/** The production caller. Throws RoleUnavailableError on transport failure,
    non-2xx, empty output, or truncation — a cut-off manuscript is not a
    manuscript, and the pipeline treats the role as unavailable rather than
    verifying a fragment. */
export const callDossierRole: RoleCaller = async (role, request) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new RoleUnavailableError(role, "ANTHROPIC_API_KEY not configured");

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      }),
    });
  } catch (e) {
    throw new RoleUnavailableError(role, e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) {
    throw new RoleUnavailableError(
      role,
      `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`
    );
  }

  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string | null;
  };
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (!text.trim()) throw new RoleUnavailableError(role, "empty model output");
  if (json.stop_reason === "max_tokens") {
    throw new RoleUnavailableError(role, "output truncated at max_tokens");
  }

  return {
    text,
    provider: PROVIDER,
    model: MODEL,
    usage: {
      inputTokens: json.usage?.input_tokens ?? 0,
      outputTokens: json.usage?.output_tokens ?? 0,
    },
    stopReason: json.stop_reason ?? null,
  };
};
