import { supabase } from "../../auth/services/supabase";
import type { MailDraft } from "../types/Mail";

export type OutgoingAttachment = {
  name: string;
  type: string;
  base64: string;
};

function baseUrl() {
  return (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
}

async function authHeaders() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  return { Authorization: "Bearer " + token };
}

export async function sendMail(
  draft: MailDraft,
  attachments: OutgoingAttachment[] = [],
) {
  const headers = await authHeaders();
  const response = await fetch(baseUrl() + "/api/mail/send", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: draft.to.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
      cc: draft.cc.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
      bcc: draft.bcc.split(/[;,]/).map((item) => item.trim()).filter(Boolean),
      subject: draft.subject,
      text: draft.text,
      threadId: draft.threadId,
      inReplyTo: draft.inReplyTo,
      references: draft.references,
      budgetId: draft.budgetId,
      clientId: draft.clientId,
      attachments,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Falha ao enviar e-mail.");
  return payload as { ok: true; messageId: string };
}

export async function downloadAttachment(id: string, filename: string) {
  const headers = await authHeaders();
  const response = await fetch(
    baseUrl() + "/api/mail/attachment?id=" + encodeURIComponent(id),
    { headers },
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Não foi possível baixar o anexo.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function fileToAttachment(file: File): Promise<OutgoingAttachment> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    base64: btoa(binary),
  };
}

export async function blobToAttachment(
  blob: Blob,
  name: string,
): Promise<OutgoingAttachment> {
  return fileToAttachment(
    new File([blob], name, { type: blob.type || "application/pdf" }),
  );
}
