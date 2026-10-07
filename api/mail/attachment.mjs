import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { applyCors, requireAdmin, sendJson, supabaseRest } from "../_lib/security.mjs";
const s3 = new S3Client({ region: process.env.AWS_REGION || "sa-east-1" });
function safeFilename(value){return String(value||"anexo").replace(/[\\/:*?"<>|\r\n]/g,"_").trim().slice(0,180)||"anexo";}
export default async function handler(req,res){
  applyCors(req,res);
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  if(req.method!=="GET") return sendJson(res,405,{error:"Método não permitido."});
  const context=await requireAdmin(req,res); if(!context) return;
  try{
    const id=String(req.query?.id||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(res,400,{error:"Anexo inválido."});
    const rows=await supabaseRest(context,"mail_attachments?id=eq."+encodeURIComponent(id)+"&select=id,filename,content_type,size_bytes,s3_key&limit=1");
    const a=rows?.[0]; if(!a?.s3_key) return sendJson(res,404,{error:"Anexo não encontrado."});
    const bucket=String(process.env.MAIL_BUCKET||""); if(!bucket) throw new Error("MAIL_BUCKET ausente.");
    const object=await s3.send(new GetObjectCommand({Bucket:bucket,Key:a.s3_key}));
    const bytes=Buffer.from(await object.Body.transformToByteArray());
    res.statusCode=200;
    res.setHeader("Content-Type",a.content_type||"application/octet-stream");
    res.setHeader("Content-Disposition","attachment; filename*=UTF-8''"+encodeURIComponent(safeFilename(a.filename)));
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Content-Length",String(bytes.byteLength));
    res.end(bytes);
  }catch(error){
    console.error("MAIL_ATTACHMENT_FAILED",error);
    return sendJson(res,500,{error:"Não foi possível baixar o anexo."});
  }
}
