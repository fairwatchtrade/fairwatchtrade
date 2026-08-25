import "server-only";

import { createClient } from "@/lib/supabase/server";

const LOGIN_ALIAS = "testuser";
const TESTUSER_EMAIL = "testingfairwatch@gmail.com";
const UNKNOWN_ALIAS_EMAIL = "unknown-login-alias@invalid.invalid";
const ADMIN_EMAIL = "jmynatt74@gmail.com";
const INVALID_CREDENTIALS = "Invalid email/username or password.";

type LoginBody = {
  identifier?: unknown;
  password?: unknown;
};

function credentialFailure() {
  return Response.json(
    { error: INVALID_CREDENTIALS },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;
  const identifier =
    typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!identifier || !password) return credentialFailure();

  const normalizedIdentifier = identifier.toLowerCase();
  let email: string;

  if (normalizedIdentifier === LOGIN_ALIAS) {
    email = TESTUSER_EMAIL;
  } else if (normalizedIdentifier.includes("@")) {
    email = identifier;
  } else {
    // Unknown aliases take the same Supabase password path as known aliases.
    // The reserved .invalid address cannot name a real account, keeping both
    // the response and the provider work indistinguishable from bad credentials.
    email = UNKNOWN_ALIAS_EMAIL;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) return credentialFailure();

  return Response.json(
    {
      ok: true,
      isAdmin:
        data.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
