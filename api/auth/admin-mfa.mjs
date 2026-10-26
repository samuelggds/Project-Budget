import crypto from "node:crypto";
import { applyCors, sendJson } from "../_lib/security.mjs";
import { callAdminMfaRpc, AdminMfaRpcError } from "../_lib/admin-mfa-rpc.mjs";

const recipient = "matheuslegend10@hotmail.com";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function config(action) {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const pepper = process.env.ADMIN_MFA_PEPPER;
  const resend = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM_EMAIL || "contato@mgrefrigeracoes.com.br";
  const allowedEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const missing = [];
  if (!url?.startsWith("https://") || !publicKey || !secretKey?.startsWith("sb_secret_") || !allowedEmail) missing.push("MFA_BASE_CONFIG");
  if (action === "request" || action === "verify") {
    if (!pepper || pepper.length < 32) missing.push("MFA_PEPPER_CONFIG");
  }
  if (action === "request" && (!resend || !emailPattern.test(from))) missing.push("MFA_MAIL_CONFIG");
  if (missing.length) { const error = new Error("MFA_CONFIG_MISSING"); error.code = missing[0]; throw error; }
  return { url, publicKey, secretKey, pepper, resend, from, allowedEmail };
}

function asJson(response) { return response.json().catch(() => ({})); }
async function authorizedSession(req, cfg) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  // User identity verified by Supabase Auth, not by client-submitted identifiers.
  const response = await fetch(cfg.url + "/auth/v1/user", {
    headers: { apikey: cfg.publicKey, Authorization: "Bearer " + token },
    cache: "no-store"
  });
  if (!response.ok) return null;
  const user = await asJson(response);
  if (!user.id || String(user.email || "").toLowerCase() !== cfg.allowedEmail) return null;
  // JWT signature validation is performed by Supabase Auth above.
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
  if (payload.sub !== user.id || typeof payload.session_id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(payload.session_id)) return null;
  return { userId: user.id, sessionId: payload.session_id };
}
const hashCode = (cfg, sessionId, code) =>
  crypto.createHmac("sha256", cfg.pepper).update(sessionId + ":" + code).digest("hex");
const expireHeaders = (res) => { res.setHeader("Cache-Control", "no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); };

export default async function handler(req, res) {
  applyCors(req, res);
  expireHeaders(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") return sendJson(res, 405, { error: "Método não permitido." });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const action = String(body.action || "");
    if (!["status", "request", "verify"].includes(action)) return sendJson(res, 400, { error: "Operação inválida." });
    const cfg = config(action);
    const session = await authorizedSession(req, cfg);
    if (!session) return sendJson(res, 401, { error: "Sessão administrativa inválida." });
    if (action === "status") {
      const result = await callAdminMfaRpc(cfg, "admin_email_mfa_status", {
        p_user_id: session.userId, p_session_id: session.sessionId
      });
      return sendJson(res, 200, { verified: result.verified === true, expiresAt: result.expiresAt || null });
    }
    if (action === "request") {
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
      const result = await callAdminMfaRpc(cfg, "admin_email_mfa_request", {
        p_user_id: session.userId, p_session_id: session.sessionId,
        p_code_hash: hashCode(cfg, session.sessionId, code)
      });
      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfter || 60));
        return sendJson(res, 429, { error: "Aguarde para solicitar outro código.", retryAfter: result.retryAfter || 60 });
      }
      const send = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + cfg.resend, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "MG Refrigerações <" + cfg.from + ">",
          to: [recipient],
          subject: "Código de segurança - acesso MG Orçamentos",
          text: "Seu código de confirmação é: " + code + "\n\nVálido por 5 minutos. Não compartilhe este código. Se não solicitou, ignore esta mensagem."
        })
      });
      if (!send.ok) {
        console.error("MFA_MAIL_SEND_ERROR", send.status);
        return sendJson(res, 503, { error: "Não foi possível enviar o código. Tente novamente depois." });
      }
      return sendJson(res, 200, { sent: true, expiresIn: 300, destination: "mat***@hotmail.com" });
    }
    if (action === "verify") {
      const code = String(body.code || "");
      if (!/^\d{6}$/.test(code)) return sendJson(res, 400, { error: "Informe os seis dígitos do código." });
      const result = await callAdminMfaRpc(cfg, "admin_email_mfa_verify", {
        p_user_id: session.userId, p_session_id: session.sessionId,
        p_code_hash: hashCode(cfg, session.sessionId, code)
      });
      if (!result.verified) return sendJson(res, 403, { error: "Código incorreto, expirado ou limite de tentativas atingido." });
      return sendJson(res, 200, { verified: true, expiresAt: result.expiresAt });
    }
    return sendJson(res, 400, { error: "Operação inválida." });
  } catch (error) {
    const code = error instanceof AdminMfaRpcError ? error.code : error?.code || "MFA_UNEXPECTED";
    console.error("MFA_HANDLER_ERROR", { code });
    const configurationProblem = String(code).endsWith("_CONFIG") || code === "MFA_CONFIG_MISSING";
    return sendJson(res, 503, {
      error: configurationProblem ? "MFA não configurado no servidor. Contate o administrador." : "Verificação de segurança indisponível.",
      code: String(code)
    });
  }
}
