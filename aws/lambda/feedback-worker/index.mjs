import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const REGION = process.env.AWS_REGION || "sa-east-1";
const secretsManager = new SecretsManagerClient({ region: REGION });

let supabaseConfigPromise = null;

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(name + " ausente");
  return normalized;
}

async function getSupabaseConfig() {
  if (!supabaseConfigPromise) {
    supabaseConfigPromise = (async () => {
      const secretId = required(process.env.SUPABASE_SECRET_ID, "SUPABASE_SECRET_ID");
      const response = await secretsManager.send(
        new GetSecretValueCommand({ SecretId: secretId }),
      );

      if (!response.SecretString) {
        throw new Error("Segredo do Supabase sem SecretString.");
      }

      let secret;
      try {
        secret = JSON.parse(response.SecretString);
      } catch {
        throw new Error("Segredo do Supabase possui JSON invalido.");
      }

      const url = required(secret.SUPABASE_URL, "SUPABASE_URL").replace(/\/+$/, "");
      const key = required(secret.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY");

      if (!url.startsWith("https://")) throw new Error("SUPABASE_URL invalida.");
      if (!key.startsWith("sb_secret_")) throw new Error("SUPABASE_SECRET_KEY invalida.");

      return { url, key };
    })().catch((error) => {
      supabaseConfigPromise = null;
      throw error;
    });
  }

  return supabaseConfigPromise;
}

async function supabaseRequest(path, { method = "GET", body, prefer = "" } = {}) {
  const { url, key } = await getSupabaseConfig();
  const response = await fetch(url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    throw new Error("Falha na API do Supabase. HTTP " + response.status);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueEmails(values) {
  return [...new Set(values.map(normalizeEmail).filter(Boolean))];
}

function recipients(type, payload) {
  if (type === "Bounce") {
    return uniqueEmails(
      (payload.bounce?.bouncedRecipients || []).map((item) => item.emailAddress),
    );
  }

  if (type === "Complaint") {
    return uniqueEmails(
      (payload.complaint?.complainedRecipients || []).map(
        (item) => item.emailAddress,
      ),
    );
  }

  if (type === "Delivery") {
    return uniqueEmails(payload.delivery?.recipients || []);
  }

  return [];
}

async function processNotification(payload) {
  const type = String(payload.notificationType || payload.eventType || "");
  const mail = payload.mail || {};
  const providerMessageId = String(mail.messageId || "").trim();

  if (!type || !providerMessageId) return;

  const eventRecipients = recipients(type, payload);
  const status =
    type === "Bounce"
      ? "bounced"
      : type === "Complaint"
        ? "complained"
        : type === "Delivery"
          ? "delivered"
          : null;

  if (status) {
    await supabaseRequest(
      "mail_messages?provider_message_id=eq." +
        encodeURIComponent(providerMessageId),
      {
        method: "PATCH",
        prefer: "return=minimal",
        body: {
          status,
          updated_at: new Date().toISOString(),
        },
      },
    );
  }

  await supabaseRequest("mail_events", {
    method: "POST",
    prefer: "return=minimal",
    body: (eventRecipients.length ? eventRecipients : [null]).map((recipient) => ({
      provider_message_id: providerMessageId,
      event_type: type.toLowerCase(),
      recipient,
      payload,
    })),
  });

  const permanentBounce =
    type === "Bounce" &&
    String(payload.bounce?.bounceType || "").toLowerCase() === "permanent";

  if ((permanentBounce || type === "Complaint") && eventRecipients.length) {
    await supabaseRequest("mail_blocklist?on_conflict=email", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: eventRecipients.map((email) => ({
        email,
        reason: type === "Complaint" ? "complaint" : "permanent_bounce",
        source_message_id: providerMessageId,
        metadata: payload,
        blocked_at: new Date().toISOString(),
      })),
    });
  }

  console.log("Feedback SES processado", {
    type,
    providerMessageId,
    recipientCount: eventRecipients.length,
    blocked: permanentBounce || type === "Complaint",
  });
}

async function processQueueRecord(record) {
  let envelope;

  try {
    envelope = JSON.parse(record.body || "{}");
  } catch {
    throw new Error("Corpo da mensagem SQS invalido.");
  }

  if (typeof envelope.Message === "string") {
    envelope = JSON.parse(envelope.Message);
  }

  await processNotification(envelope);
}

export const handler = async (event) => {
  const failures = [];

  for (const record of event?.Records || []) {
    try {
      await processQueueRecord(record);
    } catch (error) {
      console.error("FEEDBACK_WORKER_FAILED", {
        messageId: record.messageId || null,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });

      if (record.messageId) {
        failures.push({ itemIdentifier: record.messageId });
      }
    }
  }

  return { batchItemFailures: failures };
};
