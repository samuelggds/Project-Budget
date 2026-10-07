import { supabase } from "../../auth/services/supabase";
import type { MailAttachment, MailDraft, MailFolder, MailMessage } from "../types/Mail";

const text = (value: unknown) => (typeof value === "string" ? value : "");
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function mapAttachment(row: Record<string, unknown>): MailAttachment {
  return {
    id: text(row.id),
    messageId: text(row.message_id),
    filename: text(row.filename),
    contentType: text(row.content_type) || "application/octet-stream",
    sizeBytes: Number(row.size_bytes || 0),
    isInline: Boolean(row.is_inline),
  };
}

function mapMessage(row: Record<string, unknown>): MailMessage {
  const attachments = Array.isArray(row.mail_attachments)
    ? row.mail_attachments.map((item) => mapAttachment(item as Record<string, unknown>))
    : [];

  return {
    id: text(row.id),
    messageId: text(row.message_id),
    providerMessageId: text(row.provider_message_id) || undefined,
    threadId: text(row.thread_id),
    direction: row.direction === "outbound" ? "outbound" : "inbound",
    folder: (text(row.folder) || "inbox") as MailFolder,
    status: (text(row.status) || "received") as MailMessage["status"],
    fromAddress: text(row.from_address),
    fromName: text(row.from_name),
    toAddresses: strings(row.to_addresses),
    ccAddresses: strings(row.cc_addresses),
    bccAddresses: strings(row.bcc_addresses),
    replyToAddresses: strings(row.reply_to_addresses),
    subject: text(row.subject) || "(sem assunto)",
    textBody: text(row.text_body),
    snippet: text(row.snippet),
    inReplyTo: text(row.in_reply_to),
    references: strings(row.references),
    clientId: text(row.client_id) || undefined,
    budgetId: text(row.budget_id) || undefined,
    receivedAt: text(row.received_at) || undefined,
    sentAt: text(row.sent_at) || undefined,
    readAt: text(row.read_at) || undefined,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    attachments,
  };
}

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export async function listMessages(folder: MailFolder, search = "") {
  let query = supabase
    .from("mail_messages")
    .select("*, mail_attachments(*)")
    .eq("folder", folder)
    .order(folder === "sent" ? "sent_at" : "received_at", {
      ascending: false,
      nullsFirst: false,
    })
    .limit(200);

  const normalized = search.trim();
  if (normalized) {
    const safe = normalized.replaceAll("%", "\\%").replaceAll("_", "\\_");
    query = query.or(
      "subject.ilike.%" +
        safe +
        "%,from_address.ilike.%" +
        safe +
        "%,from_name.ilike.%" +
        safe +
        "%,snippet.ilike.%" +
        safe +
        "%",
    );
  }

  const { data, error } = await query;
  throwIf(error);
  return (data || []).map((row) => mapMessage(row as Record<string, unknown>));
}

export async function listThread(threadId: string) {
  const { data, error } = await supabase
    .from("mail_messages")
    .select("*, mail_attachments(*)")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  throwIf(error);
  return (data || []).map((row) => mapMessage(row as Record<string, unknown>));
}

export async function markMessageRead(id: string) {
  const { error } = await supabase
    .from("mail_messages")
    .update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  throwIf(error);
}

export async function moveMessage(id: string, folder: MailFolder) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("mail_messages")
    .update({
      folder,
      archived_at: folder === "archive" ? now : null,
      deleted_at: folder === "trash" ? now : null,
      updated_at: now,
    })
    .eq("id", id);
  throwIf(error);
}

export async function saveDraft(draft: MailDraft) {
  const now = new Date().toISOString();
  const id = draft.id || crypto.randomUUID();
  const messageId = draft.id || "draft-" + crypto.randomUUID();

  const { data, error } = await supabase
    .from("mail_messages")
    .upsert({
      id,
      message_id: messageId,
      thread_id: draft.threadId || crypto.randomUUID(),
      direction: "outbound",
      folder: "draft",
      status: "draft",
      from_address: "contato@mgrefrigeracoes.com.br",
      from_name: "MG Refrigerações",
      to_addresses: draft.to
        .split(/[;,]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      cc_addresses: draft.cc
        .split(/[;,]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      bcc_addresses: draft.bcc
        .split(/[;,]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      subject: draft.subject,
      text_body: draft.text,
      snippet: draft.text.replace(/\s+/g, " ").slice(0, 220),
      in_reply_to: draft.inReplyTo || null,
      references: draft.references || [],
      budget_id: draft.budgetId || null,
      client_id: draft.clientId || null,
      updated_at: now,
    })
    .select("*, mail_attachments(*)")
    .single();

  throwIf(error);
  return mapMessage(data as Record<string, unknown>);
}

export async function deleteDraft(id: string) {
  const { error } = await supabase
    .from("mail_messages")
    .delete()
    .eq("id", id)
    .eq("folder", "draft");
  throwIf(error);
}
