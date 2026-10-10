import crypto from "node:crypto";
import { sendJson, supabaseSecretRest } from "../_lib/security.mjs";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(name + " ausente.");
  return normalized;
}

function normalizeEmails(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((v) => String(v || "").trim().toLowerCase()).filter(Boolean))];
}

async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error("Payload do webhook acima do limite.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function verifySvixSignature({ payload, id, timestamp, signature, secret, now = Date.now() }) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(now / 1000) - ts) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const secretValue = String(secret || "").replace(/^whsec_/, "");
  let key;
  try {
    key = Buffer.from(secretValue, "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;

  const signed = String(id) + "." + String(timestamp) + "." + payload;
  const expected = crypto.createHmac("sha256", key).update(signed).digest();

  return String(signature || "")
    .split(/\s+/)
    .map((part) => part.split(","))
    .some(([version, encoded]) => {
      if (version !== "v1" || !encoded) return false;
      let actual;
      try {
        actual = Buffer.from(encoded, "base64");
      } catch {
        return false;
      }
      return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    });
}

function eventStatus(type) {
  if (type === "email.delivered") return "delivered";
  if (type === "email.bounced" || type === "email.suppressed") return "bounced";
  if (type === "email.complained") return "complained";
  if (type === "email.failed") return "failed";
  return null;
}

function shouldBlock(type, data) {
  if (type === "email.complained" || type === "email.suppressed") return true;
  if (type !== "email.bounced") return false;
  return String(data?.bounce?.type || "").toLowerCase() === "permanent";
}

function blockReason(type) {
  if (type === "email.complained") return "complaint";
  if (type === "email.suppressed") return "suppressed";
  return "permanent_bounce";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Método não permitido." });

  try {
    const secret = required(process.env.RESEND_WEBHOOK_SECRET, "RESEND_WEBHOOK_SECRET");
    const rawBody = await readRawBody(req);
    const id = required(req.headers["svix-id"], "svix-id");
    const timestamp = required(req.headers["svix-timestamp"], "svix-timestamp");
    const signature = required(req.headers["svix-signature"], "svix-signature");

    if (!verifySvixSignature({ payload: rawBody, id, timestamp, signature, secret })) {
      return sendJson(res, 401, { error: "Assinatura inválida." });
    }

    const event = JSON.parse(rawBody);
    const type = String(event?.type || "");
    const data = event?.data || {};
    const providerMessageId = String(data.email_id || "").trim();

    if (!type || !providerMessageId) {
      return sendJson(res, 200, { ok: true, ignored: true });
    }

    const status = eventStatus(type);
    const recipients = normalizeEmails(data.to);

    if (status) {
      await supabaseSecretRest(
        "mail_messages?provider_message_id=eq." + encodeURIComponent(providerMessageId),
        {
          method: "PATCH",
          prefer: "return=minimal",
          body: { status, updated_at: new Date().toISOString() },
        },
      );
    }

    const eventRows = (recipients.length ? recipients : [""]).map((recipient) => ({
      provider_event_id: id,
      provider_message_id: providerMessageId,
      event_type: type,
      recipient,
      payload: event,
    }));

    await supabaseSecretRest("mail_events?on_conflict=provider_event_id,recipient", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=minimal",
      body: eventRows,
    });

    if (shouldBlock(type, data) && recipients.length) {
      await supabaseSecretRest("mail_blocklist?on_conflict=email", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: recipients.map((email) => ({
          email,
          reason: blockReason(type),
          source_message_id: providerMessageId,
          metadata: event,
          blocked_at: new Date().toISOString(),
        })),
      });
    }

    console.log("Feedback Resend processado", {
      type,
      providerMessageId,
      recipientCount: recipients.length,
      blocked: shouldBlock(type, data),
    });

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("RESEND_WEBHOOK_FAILED", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return sendJson(res, 500, { error: "Falha ao processar webhook." });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
