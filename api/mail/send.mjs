import crypto from "node:crypto";
import { applyCors, requireAdmin, sendJson, supabaseRest } from "../_lib/security.mjs";

const RESEND_API_URL = "https://api.resend.com/emails";
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
function escapeHtml(value) {
  return String(value || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function safeFilename(value) {
  return String(value || "arquivo").replace(/[\\/:*?"<>|\r\n]/g, "_").trim().slice(0, 120) || "arquivo";
}
function requireServerEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(name + " ausente.");
  return value;
}
function resendErrorStatus(status) {
  if (status === 400 || status === 422) return 400;
  if (status === 401 || status === 403) return 502;
  if (status === 429) return 503;
  return 502;
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
      return {
        filename:safeFilename(item.name),
        content:buf.toString("base64"),
        content_type:sanitizeHeader(item.type||"application/octet-stream",100),
      };
    });
    if (totalBytes > MAX_ATTACHMENT_BYTES) return sendJson(res,413,{error:"Anexos acima de 5 MB."});

    const blockedRows = await supabaseRest(context,"mail_blocklist?select=email");
    const blocked = new Set((blockedRows||[]).map((x)=>String(x.email||"").toLowerCase()));
    const rejected=all.filter((email)=>blocked.has(email));
    if (rejected.length) return sendJson(res,409,{error:"Envio bloqueado para: "+rejected.join(", ")+". Endereço com bounce permanente, supressão ou reclamação."});

    const apiKey = requireServerEnv("RESEND_API_KEY");
    const fromEmail = validEmail(process.env.MAIL_FROM_EMAIL || "contato@mgrefrigeracoes.com.br");
    const fromName = sanitizeHeader(process.env.MAIL_FROM_NAME || "MG Refrigerações",120);
    if (!fromEmail) throw new Error("MAIL_FROM_EMAIL inválido.");

    const inReplyTo=sanitizeHeader(body.inReplyTo||"",998);
    const references=(Array.isArray(body.references)?body.references:[]).map((x)=>sanitizeHeader(x,998)).filter(Boolean).slice(-30);

    const providerResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromName + " <" + fromEmail + ">",
        to,
        ...(cc.length ? { cc } : {}),
        ...(bcc.length ? { bcc } : {}),
        subject,
        text,
        html: '<div style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;line-height:1.55;color:#172033">' + escapeHtml(text) + "</div>",
        ...(attachments.length ? { attachments } : {}),
        ...((inReplyTo || references.length) ? {
          headers: {
            ...(inReplyTo ? { "In-Reply-To": inReplyTo } : {}),
            ...(references.length ? { References: references.join(" ") } : {}),
          },
        } : {}),
      }),
    });

    const providerPayload = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) {
      console.error("RESEND_SEND_FAILED", {
        status: providerResponse.status,
        providerCode: sanitizeHeader(providerPayload?.name || providerPayload?.code || "",80),
      });
      return sendJson(res,resendErrorStatus(providerResponse.status),{
        error:"Não foi possível enviar o e-mail neste momento.",
        code:"MAIL_PROVIDER_ERROR",
      });
    }

    const providerMessageId=String(providerPayload.id||"").trim();
    if (!providerMessageId) throw new Error("Resend não retornou id da mensagem.");

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
    console.error("MAIL_SEND_FAILED", {
      error: error instanceof Error ? error.message : "Erro desconhecido",
    });
    return sendJson(res,500,{error:"Não foi possível enviar o e-mail.",code:"MAIL_SEND_FAILED"});
  }
}
