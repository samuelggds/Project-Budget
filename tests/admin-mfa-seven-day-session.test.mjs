import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const upgrade = readFileSync(new URL("../supabase/admin-email-mfa-seven-day-session.sql", import.meta.url), "utf8");
const initial = readFileSync(new URL("../supabase/admin-email-mfa-migration.sql", import.meta.url), "utf8");
const frontend = readFileSync(new URL("../src/modules/auth/components/AuthGate.tsx", import.meta.url), "utf8");
const supabase = readFileSync(new URL("../src/modules/auth/services/supabase.ts", import.meta.url), "utf8");

test("MFA grants seven days only after matching a valid one-time code", () => {
  const checks = [
    "v_challenge.consumed_at is not null",
    "v_challenge.expires_at <= now()",
    "v_challenge.attempts >= 5",
    "v_challenge.code_hash <> p_code_hash",
  ];
  const grantIndex = upgrade.indexOf("insert into public.admin_email_mfa_grants");
  assert.ok(grantIndex > 0, "verified grant must be persisted");
  for (const check of checks) {
    const index = upgrade.indexOf(check);
    assert.ok(index >= 0 && index < grantIndex, check + " must be checked before granting access");
  }
  assert.match(upgrade, /v_until\s*:=\s*now\(\)\s*\+\s*interval '7 days';/);
  assert.match(upgrade, /return jsonb_build_object\('verified', true, 'expiresAt', v_until\)/);
});

test("MFA verification is limited to the authenticated user and session ID", () => {
  assert.match(upgrade, /from public\.admin_email_mfa_challenges\s+where user_id = p_user_id and session_id = p_session_id/);
  assert.match(upgrade, /values \(p_user_id, p_session_id, now\(\), v_until\)/);
  assert.match(upgrade, /revoke all on function public\.admin_email_mfa_verify\(uuid,uuid,text\) from public, anon, authenticated;/);
  assert.match(upgrade, /grant execute on function public\.admin_email_mfa_verify\(uuid,uuid,text\) to service_role;/);
});

test("status and RLS check original absolute expiration and never extend it", () => {
  assert.match(initial, /create or replace function public\.admin_email_mfa_status\(/);
  assert.match(initial, /from public\.admin_email_mfa_grants\s+where user_id = p_user_id\s+and session_id = p_session_id\s+and expires_at > now\(\)/);
  assert.match(initial, /grant_row\.session_id::text = \(auth\.jwt\(\) ->> 'session_id'\)/);
  assert.match(initial, /grant_row\.expires_at > now\(\)/);
  assert.doesNotMatch(upgrade, /update public\.admin_email_mfa_grants\s+set expires_at/i);
});

test("Supabase persists the session and the UI checks server verification on reopening", () => {
  assert.match(supabase, /persistSession: true/);
  assert.match(supabase, /autoRefreshToken: true/);
  assert.match(frontend, /const status = await mfaRequest\("status"\)/);
  assert.match(frontend, /const confirmedUntil = verifiedSessionExpiresAt\(status\)/);
  assert.match(frontend, /const confirmedUntil = verifiedSessionExpiresAt\(result\)/);
  assert.match(frontend, /if \(!confirmedUntil\) throw new Error/);
});
