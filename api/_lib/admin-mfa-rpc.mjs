// Chaves sb_secret_* sao opacas e devem ser enviadas SOMENTE no header "apikey".
// Nunca use "Authorization: Bearer sb_secret_*": nao e um JWT valido.
// O usuario ja deve ter sido autenticado via Supabase Auth antes de chamar esta funcao.

const RPC_NAMES = new Set([
  "admin_email_mfa_status",
  "admin_email_mfa_request",
  "admin_email_mfa_verify"
]);

export class AdminMfaRpcError extends Error {
  constructor(code) {
    super(code);
    this.name = "AdminMfaRpcError";
    this.code = code;
  }
}

export async function callAdminMfaRpc({ url, secretKey }, name, params) {
  if (!RPC_NAMES.has(name)) throw new AdminMfaRpcError("MFA_RPC_NOT_ALLOWED");
  if (!url?.startsWith("https://") || !secretKey?.startsWith("sb_secret_")) {
    throw new AdminMfaRpcError("MFA_DB_CONFIG");
  }

  let response;
  try {
    response = await fetch(url.replace(/\/+$/, "") + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {
        apikey: secretKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(params),
      cache: "no-store"
    });
  } catch {
    throw new AdminMfaRpcError("MFA_DB_CONNECTION");
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const providerCode = String(detail?.code || "").slice(0, 50);
    console.error("ADMIN_MFA_RPC_REJECTED", {
      name,
      status: response.status,
      providerCode
    });
    if (response.status === 404 || providerCode === "PGRST202") {
      throw new AdminMfaRpcError("MFA_DB_MIGRATION_REQUIRED");
    }
    throw new AdminMfaRpcError("MFA_DB_QUERY_FAILED");
  }

  try {
    const result = await response.json();
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Invalid RPC response");
    }
    return result;
  } catch {
    throw new AdminMfaRpcError("MFA_DB_RESPONSE_INVALID");
  }
}
