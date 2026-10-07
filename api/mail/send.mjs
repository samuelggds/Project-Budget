import crypto from "node:crypto";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { applyCors, requireAdmin, sendJson, supabaseRest } from "../_lib/security.mjs";

const ses = new SESClient({ region: process.env.AWS_REGION || "sa-east-1" });
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function sanitizeHeader(value, max = 500) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}
function validEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
function normalizeRecipients(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(validEmail).filter(Boolean))].slice(0, 25);
}
function encodeHeader(value) {
  const clean = sanitizeHeader(value, 998);
  return /^[\x20-\x7E]*$/.test(clean) ? clean : "=?UTF-8?B?" + Buffer.from(clean).toString("base64") + "?=";
}
function escapeHtml(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function safeFilename(value) {
  return String(value || "arquivo").replace(/[\\/:*?"<>|\r\n]/g, "_").trim().slice(0, 120) || "arquivo";
}
function wrapBase64(value) {
  return value.match(/.{1,76}/g)?.join("\r\n") || "";
}
function buildRawEmail({fromName,fromEmail,to,cc,subject,text,inReplyTo,references,attachments}) {
  const mixedBoundary = "mixed_" + crypto.randomUUID().replaceAll("-", "");
  const altBoundary = "alt_" + crypto.randomUUID().replaceAll("-", "");
  const headers = [
    "From: " + encodeHeader(fromName) + " <" + fromEmail + ">",
    "To: " + to.join(", "),
    ...(cc.length ? ["Cc: " + cc.join(", ")] : []),
    "Subject: " + encodeHeader(subject),
    "MIME-Version: 1.0",
    ...(inReplyTo ? ["In-Reply-To: " + sanitizeHeader(inReplyTo,998)] : []),
    ...(references?.length ? ["References: " + references.map((x)=>sanitizeHeader(x,998)).join(" ")] : []),
    'Content-Type: multipart/mixed; boundary="' + mixedBoundary + '"'
  ];
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;line-height:1.55;color:#172033">' + escapeHtml(text) + "</div>";
  const parts = [
    "--"+mixedBoundary,
    'Content-Type: multipart/alternative; boundary="' + altBoundary + '"',
    "",
    "--"+altBoundary,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "--"+altBoundary,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "--"+altBoundary+"--"
  ];
  for (const a of attachments) {
    parts.push(
      "--"+mixedBoundary,
      'Content-Type: ' + a.type + '; name="' + encodeHeader(a.name) + '"',
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="' + encodeHeader(a.name) + '"',
      "",
      wrapBase64(a.base64)
    );
  }
  parts.push("--"+mixedBoundary+"--","");
  return Buffer.from([...headers,"",...parts].join("\r\n"),"utf8");
}

export default async function handler(req,res) {
  applyCors(req,res);
  if (req.method === "OPTIONS") { res.statusCode=204; return res.end(); }
  if (req.method !== "POST") return sendJson(res,405,{error:"Método não permitido."});
  const context = await requireAdmin(req,res);
  if (!context) return;

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const to = normalizeRecipients(body.to), cc = normalizeRecipients(body.cc), bcc = normalizeRecipients(body.bcc);
    const all = [...new Set([...to,...cc,...bcc])];
    if (!to.length) return sendJson(res,400,{error:"Informe ao menos um destinatário válido."});
    if (all.length > 25) return sendJson(res,400,{error:"Máximo de 25 destinatários por mensagem."});

    const subject = sanitizeHeader(body.subject || "(sem assunto)",300);
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res,400,{error:"O corpo do e-mail está vazio."});
    if (text.length > 200000) return sendJson(res,413,{error:"E-mail muito grande."});

    const rawAttachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (rawAttachments.length > MAX_ATTACHMENTS) return sendJson(res,413,{error:"Máximo de 10 anexos."});
    let totalBytes=0;
    const attachments=rawAttachments.map((item)=>{
      const base64=String(item.base64||"").replace(/^data:[^;]+;base64,/,"");
      const buf=Buffer.from(base64,"base64");
      totalBytes+=buf.byteLength;
      return {name:safeFilename(item.name),type:sanitizeHeader(item.type||"application/octet-stream",100),base64:buf.toString("base64")};
    });
    if (totalBytes > MAX_ATTACHMENT_BYTES) return sendJson(res,413,{error:"Anexos acima de 5 MB."});

    const blockedRows = await supabaseRest(context,"mail_blocklist?select=email");
    const blocked = new Set((blockedRows||[]).map((x)=>String(x.email||"").toLowerCase()));
    const rejected=all.filter((email)=>blocked.has(email));
    if (rejected.length) return sendJson(res,409,{error:"Envio bloqueado para: "+rejected.join(", ")+". Endereço com bounce permanente ou reclamação."});

    const fromEmail = validEmail(process.env.SES_FROM_EMAIL || "contato@mgrefrigeracoes.com.br");
    const fromName = sanitizeHeader(process.env.SES_FROM_NAME || "MG Refrigerações",120);
    if (!fromEmail) throw new Error("SES_FROM_EMAIL inválido.");

    const inReplyTo=sanitizeHeader(body.inReplyTo||"",998);
    const references=(Array.isArray(body.references)?body.references:[]).map((x)=>sanitizeHeader(x,998)).filter(Boolean).slice(-30);

    const result = await ses.send(new SendRawEmailCommand({
      Source: fromEmail,
      Destinations: all,
      RawMessage:{Data:buildRawEmail({fromName,fromEmail,to,cc,subject,text,inReplyTo,references,attachments})}
    }));

    const providerMessageId=String(result.MessageId||crypto.randomUUID());
    const threadId=sanitizeHeader(body.threadId||crypto.randomUUID(),200);
    const now=new Date().toISOString();
    const inserted=await supabaseRest(context,"mail_messages?on_conflict=message_id",{
      method:"POST",
      prefer:"resolution=merge-duplicates,return=representation",
      body:[{
        message_id:providerMessageId,provider_message_id:providerMessageId,thread_id:threadId,
        direction:"outbound",folder:"sent",status:"sent",from_address:fromEmail,from_name:fromName,
        to_addresses:to,cc_addresses:cc,bcc_addresses:bcc,reply_to_addresses:[],
        subject,text_body:text,html_body:null,snippet:text.replace(/\s+/g," ").slice(0,220),
        in_reply_to:inReplyTo||null,references,sent_at:now,received_at:null,read_at:now,
        budget_id:body.budgetId||null,client_id:body.clientId||null,updated_at:now
      }]
    });
    return sendJson(res,200,{ok:true,messageId:providerMessageId,message:inserted?.[0]||null});
  } catch (error) {
    console.error("MAIL_SEND_FAILED",error);
    return sendJson(res,500,{error:"Não foi possível enviar o e-mail.",code:"MAIL_SEND_FAILED"});
  }
}
