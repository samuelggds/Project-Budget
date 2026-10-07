import crypto from "node:crypto";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { simpleParser } from "mailparser";

const s3 = new S3Client({ region: process.env.AWS_REGION || "sa-east-1" });

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(name + " ausente");
  return value;
}
function cfg() {
  return { url: required("SUPABASE_URL").replace(/\/+$/, ""), key: required("SUPABASE_SERVICE_ROLE_KEY") };
}
async function sb(path, { method = "GET", body, prefer = "" } = {}) {
  const { url, key } = cfg();
  const response = await fetch(url + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error("Supabase " + response.status + ": " + (await response.text()).slice(0,500));
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
function addressList(obj) {
  return (obj?.value || []).map((x)=>String(x.address||"").trim().toLowerCase()).filter(Boolean);
}
function displayName(obj) { return String(obj?.value?.[0]?.name || "").trim(); }
function normalizeReferences(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/\s+/);
  return [...new Set(list.map((x)=>String(x).trim()).filter(Boolean))].slice(-30);
}
function normalizeSubject(value) {
  return String(value||"").replace(/^\s*((re|fw|fwd)\s*:\s*)+/gi,"").replace(/\s+/g," ").trim().toLowerCase();
}
function safeFilename(value) {
  return String(value||"anexo").replace(/[\\/:*?"<>|\r\n]/g,"_").trim().slice(0,140)||"anexo";
}
async function resolveThreadId({inReplyTo,references,subject,participants}) {
  for (const candidate of [inReplyTo,...references].filter(Boolean)) {
    const normalizedCandidate = String(candidate).replace(/^<|>$/g, "");
    const rows=await sb(
      "mail_messages?or=(message_id.eq."+
        encodeURIComponent(candidate)+
        ",provider_message_id.eq."+
        encodeURIComponent(normalizedCandidate)+
        ")&select=thread_id&limit=1"
    );
    if(rows?.[0]?.thread_id) return rows[0].thread_id;
  }

  const baseSubject=normalizeSubject(subject);
  if(baseSubject){
    const rows=await sb(
      "mail_messages?direction=eq.outbound&subject=ilike."+
        encodeURIComponent(baseSubject)+
        "&select=thread_id,to_addresses,from_address&order=sent_at.desc.nullslast&limit=20"
    );
    const participantSet=new Set(participants.map((x)=>String(x).toLowerCase()));
    for(const row of rows||[]){
      const addresses=[...(row.to_addresses||[]),row.from_address]
        .map((x)=>String(x||"").toLowerCase())
        .filter(Boolean);
      if(addresses.some((address)=>participantSet.has(address))) return row.thread_id;
    }
  }

  const seed=[inReplyTo,...references].filter(Boolean)[0] || baseSubject+"|"+participants.sort().join("|");
  return crypto.createHash("sha256").update(seed||crypto.randomUUID()).digest("hex").slice(0,40);
}
async function processS3Record(record) {
  const bucket=record?.s3?.bucket?.name, encodedKey=record?.s3?.object?.key;
  if(!bucket||!encodedKey) return;
  const key=decodeURIComponent(String(encodedKey).replace(/\+/g," "));
  if(!key.startsWith("inbox/raw/")) return;

  const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key}));
  const raw=Buffer.from(await object.Body.transformToByteArray());
  const parsed=await simpleParser(raw,{skipHtmlToText:false,skipTextToHtml:true});
  const from=addressList(parsed.from),to=addressList(parsed.to),cc=addressList(parsed.cc),replyTo=addressList(parsed.replyTo);
  const messageId=String(parsed.messageId||("<"+crypto.randomUUID()+"@inbound.local>")).trim();
  const inReplyTo=String(parsed.inReplyTo||"").trim(),references=normalizeReferences(parsed.references);
  const subject=String(parsed.subject||"(sem assunto)").slice(0,500);
  const textBody=String(parsed.text||"").slice(0,1000000);
  const htmlBody=typeof parsed.html==="string" ? parsed.html.slice(0,2000000) : null;
  const receivedAt=(parsed.date||new Date()).toISOString();
  const threadId=await resolveThreadId({inReplyTo,references,subject,participants:[...new Set([...from,...to,...cc])]});

  const rows=await sb("mail_messages?on_conflict=message_id",{
    method:"POST",prefer:"resolution=merge-duplicates,return=representation",
    body:[{
      message_id:messageId,provider_message_id:null,thread_id:threadId,direction:"inbound",folder:"inbox",status:"received",
      from_address:from[0]||"desconhecido@invalid",from_name:displayName(parsed.from)||null,to_addresses:to,cc_addresses:cc,bcc_addresses:[],
      reply_to_addresses:replyTo,subject,text_body:textBody||null,html_body:htmlBody,
      snippet:(textBody||subject).replace(/\s+/g," ").slice(0,220),in_reply_to:inReplyTo||null,references,
      received_at:receivedAt,sent_at:null,read_at:null,s3_raw_key:key,updated_at:new Date().toISOString()
    }]
  });
  const message=rows?.[0]; if(!message?.id) throw new Error("Mensagem não persistida.");

  const attachmentRows=[];
  for(const [index,a] of (parsed.attachments||[]).entries()){
    if(!a?.content?.length) continue;
    const filename=safeFilename(a.filename);
    const attachmentKey="inbox/attachments/"+message.id+"/"+String(index).padStart(3,"0")+"-"+filename;
    await s3.send(new PutObjectCommand({
      Bucket:bucket,Key:attachmentKey,Body:a.content,
      ContentType:a.contentType||"application/octet-stream",ServerSideEncryption:"AES256"
    }));
    attachmentRows.push({
      message_id:message.id,filename,content_type:a.contentType||"application/octet-stream",
      size_bytes:a.size||a.content.length,s3_key:attachmentKey,is_inline:a.contentDisposition==="inline",content_id:a.contentId||null
    });
  }
  if(attachmentRows.length) await sb("mail_attachments?on_conflict=s3_key",{method:"POST",prefer:"resolution=merge-duplicates,return=minimal",body:attachmentRows});
}
export const handler=async(event)=>{
  for(const sqsRecord of event.Records||[]){
    let payload=JSON.parse(sqsRecord.body||"{}");
    if(typeof payload.Message==="string") payload=JSON.parse(payload.Message);
    for(const record of payload.Records||[]) if(record.eventSource==="aws:s3") await processS3Record(record);
  }
  return {ok:true};
};
