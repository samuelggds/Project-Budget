import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { callAdminMfaRpc, AdminMfaRpcError } from "../api/_lib/admin-mfa-rpc.mjs";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const cfg = { url: "https://example.supabase.co", secretKey: "sb_secret_test_key" };

test("MFA status sends only the secret apikey, never bearer secret", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.apikey, cfg.secretKey);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.method, "POST");
    return { ok: true, json: async () => ({ verified: false }) };
  };
  assert.deepEqual(await callAdminMfaRpc(cfg, "admin_email_mfa_status", {
    p_user_id: "u", p_session_id: "s"
  }), { verified: false });
});

test("MFA RPC fails closed for absent/invalid configuration", async () => {
  await assert.rejects(
    callAdminMfaRpc({ url: "https://example.supabase.co", secretKey: "" }, "admin_email_mfa_status", {}),
    { code: "MFA_DB_CONFIG" }
  );
});

test("MFA RPC reports missing migration and never returns verified", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ code: "PGRST202" }) });
  await assert.rejects(callAdminMfaRpc(cfg, "admin_email_mfa_status", {}), { code: "MFA_DB_MIGRATION_REQUIRED" });
});

test("MFA RPC rejects unexpected response formats", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => [] });
  await assert.rejects(callAdminMfaRpc(cfg, "admin_email_mfa_status", {}), { code: "MFA_DB_RESPONSE_INVALID" });
});
