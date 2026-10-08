import crypto from "node:crypto";

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { simpleParser } = require("mailparser");

const REGION = process.env.AWS_REGION || "sa-east-1";
const s3 = new S3Client({ region: REGION });
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

function addressList(value) {
  return (value?.value || [])
    .map((item) => String(item.address || "").trim().toLowerCase())
    .filter(Boolean);
}

function displayName(value) {
  return String(value?.value?.[0]?.name || "").trim();
}

function normalizeReferences(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/\s+/);
  return [
    ...new Set(list.map((item) => String(item).trim()).filter(Boolean)),
  ].slice(-30);
}

function normalizeSubject(value) {
  return String(value || "")
    .replace(/^\s*((re|fw|fwd)\s*:\s*)+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function safeFilename(value) {
  return (
    String(value || "anexo")
      .replace(/[\\/:*?"<>|\r\n]/g, "_")
      .trim()
      .slice(0, 140) || "anexo"
  );
}

async function resolveThreadId({ inReplyTo, references, subject, participants }) {
  const candidates = [inReplyTo, ...references].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = String(candidate).replace(/^<|>$/g, "");
    const rows = await supabaseRequest(
      "mail_messages?or=(message_id.eq." +
        encodeURIComponent(candidate) +
        ",provider_message_id.eq." +
        encodeURIComponent(normalizedCandidate) +
        ")&select=thread_id&limit=1",
    );

    if (rows?.[0]?.thread_id) return rows[0].thread_id;
  }

  const baseSubject = normalizeSubject(subject);
  if (baseSubject) {
    const rows = await supabaseRequest(
      "mail_messages?direction=eq.outbound" +
        "&subject=ilike." +
        encodeURIComponent(baseSubject) +
        "&select=thread_id,to_addresses,from_address" +
        "&order=sent_at.desc.nullslast" +
        "&limit=20",
    );

    const participantSet = new Set(
      participants.map((item) => String(item).toLowerCase()),
    );

    for (const row of rows || []) {
      const addresses = [...(row.to_addresses || []), row.from_address]
        .map((item) => String(item || "").toLowerCase())
        .filter(Boolean);

      if (addresses.some((address) => participantSet.has(address))) {
        return row.thread_id;
      }
    }
  }

  const seed =
    candidates[0] ||
    baseSubject + "|" + [...participants].sort().join("|");

  return crypto
    .createHash("sha256")
    .update(seed || crypto.randomUUID())
    .digest("hex")
    .slice(0, 40);
}

async function processS3Record(record) {
  const bucket = record?.s3?.bucket?.name;
  const encodedKey = record?.s3?.object?.key;

  if (!bucket || !encodedKey) {
    throw new Error("Evento S3 sem bucket ou chave.");
  }

  const key = decodeURIComponent(String(encodedKey).replace(/\+/g, " "));
  if (!key.startsWith("inbox/raw/")) return;

  const object = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );
  const raw = Buffer.from(await object.Body.transformToByteArray());
  const parsed = await simpleParser(raw, {
    skipHtmlToText: false,
    skipTextToHtml: true,
  });

  const from = addressList(parsed.from);
  const to = addressList(parsed.to);
  const cc = addressList(parsed.cc);
  const replyTo = addressList(parsed.replyTo);

  const messageId = String(
    parsed.messageId || "<" + crypto.randomUUID() + "@inbound.local>",
  ).trim();
  const inReplyTo = String(parsed.inReplyTo || "").trim();
  const references = normalizeReferences(parsed.references);
  const subject = String(parsed.subject || "(sem assunto)").slice(0, 500);
  const textBody = String(parsed.text || "").slice(0, 1_000_000);
  const htmlBody =
    typeof parsed.html === "string" ? parsed.html.slice(0, 2_000_000) : null;
  const receivedAt = (parsed.date || new Date()).toISOString();

  const participants = [...new Set([...from, ...to, ...cc])];
  const threadId = await resolveThreadId({
    inReplyTo,
    references,
    subject,
    participants,
  });

  const rows = await supabaseRequest("mail_messages?on_conflict=message_id", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: [
      {
        message_id: messageId,
        provider_message_id: null,
        thread_id: threadId,
        direction: "inbound",
        folder: "inbox",
        status: "received",
        from_address: from[0] || "desconhecido@invalid",
        from_name: displayName(parsed.from) || null,
        to_addresses: to,
        cc_addresses: cc,
        bcc_addresses: [],
        reply_to_addresses: replyTo,
        subject,
        text_body: textBody || null,
        html_body: htmlBody,
        snippet: (textBody || subject).replace(/\s+/g, " ").slice(0, 220),
        in_reply_to: inReplyTo || null,
        references,
        s3_raw_key: key,
        received_at: receivedAt,
        sent_at: null,
        read_at: null,
        updated_at: new Date().toISOString(),
      },
    ],
  });

  const message = rows?.[0];
  if (!message?.id) throw new Error("Mensagem nao foi persistida.");

  const attachmentRows = [];

  for (const [index, attachment] of (parsed.attachments || []).entries()) {
    if (!attachment?.content?.length) continue;

    const filename = safeFilename(attachment.filename);
    const attachmentKey =
      "inbox/attachments/" +
      message.id +
      "/" +
      String(index).padStart(3, "0") +
      "-" +
      filename;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: attachmentKey,
        Body: attachment.content,
        ContentType: attachment.contentType || "application/octet-stream",
        ServerSideEncryption: "AES256",
      }),
    );

    attachmentRows.push({
      message_id: message.id,
      filename,
      content_type: attachment.contentType || "application/octet-stream",
      size_bytes: attachment.size || attachment.content.length,
      s3_key: attachmentKey,
      is_inline: attachment.contentDisposition === "inline",
      content_id: attachment.contentId || null,
    });
  }

  if (attachmentRows.length) {
    await supabaseRequest("mail_attachments?on_conflict=s3_key", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: attachmentRows,
    });
  }

  console.log("E-mail processado com sucesso", {
    s3Key: key,
    attachmentCount: attachmentRows.length,
  });
}

async function processQueueRecord(sqsRecord) {
  let payload;

  try {
    payload = JSON.parse(sqsRecord.body || "{}");
  } catch {
    throw new Error("Corpo da mensagem SQS invalido.");
  }

  if (typeof payload.Message === "string") {
    payload = JSON.parse(payload.Message);
  }

  if (payload.Event === "s3:TestEvent") return;

  for (const record of payload.Records || []) {
    if (record.eventSource === "aws:s3") {
      await processS3Record(record);
    }
  }
}

export const handler = async (event) => {
  const failures = [];

  for (const sqsRecord of event?.Records || []) {
    try {
      await processQueueRecord(sqsRecord);
    } catch (error) {
      console.error("INBOX_WORKER_FAILED", {
        messageId: sqsRecord.messageId || null,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      });

      if (sqsRecord.messageId) {
        failures.push({ itemIdentifier: sqsRecord.messageId });
      }
    }
  }

  return { batchItemFailures: failures };
};
