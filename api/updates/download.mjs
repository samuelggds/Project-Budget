import { Readable } from "node:stream";
import { applyCors, sendJson } from "../_lib/security.mjs";
const OWNER="samuelggds",REPO="Project-Budget";
function headers(accept="application/vnd.github+json"){
  const token=String(process.env.GITHUB_RELEASES_TOKEN||"");
  return {Accept:accept,"X-GitHub-Api-Version":"2022-11-28",...(token?{Authorization:"Bearer "+token}:{})};
}
export default async function handler(req,res){
  applyCors(req,res);
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  if(req.method!=="GET") return sendJson(res,405,{error:"Método não permitido."});
  try{
    if(!process.env.GITHUB_RELEASES_TOKEN) throw new Error("GITHUB_RELEASES_TOKEN ausente.");
    const requested=String(req.query?.asset||"").trim();
    if(!requested||requested.length>180||!/^[A-Za-z0-9._+() -]+$/.test(requested)) return sendJson(res,400,{error:"Artefato inválido."});
    const rr=await fetch("https://api.github.com/repos/"+OWNER+"/"+REPO+"/releases/latest",{headers:headers(),cache:"no-store"});
    if(!rr.ok) throw new Error("GitHub release "+rr.status);
    const release=await rr.json();
    const asset=(release.assets||[]).find((x)=>x.name===requested);
    if(!asset) return sendJson(res,404,{error:"Artefato não encontrado."});
    const ar=await fetch(asset.url,{headers:headers("application/octet-stream"),redirect:"follow",cache:"no-store"});
    if(!ar.ok||!ar.body) throw new Error("GitHub asset "+ar.status);
    res.statusCode=200;res.setHeader("Content-Type",asset.content_type||"application/octet-stream");
    res.setHeader("Content-Disposition","attachment; filename*=UTF-8''"+encodeURIComponent(asset.name));
    res.setHeader("Cache-Control","public, max-age=31536000, immutable");
    const len=ar.headers.get("content-length"); if(len) res.setHeader("Content-Length",len);
    Readable.fromWeb(ar.body).pipe(res);
  }catch(error){
    console.error("TAURI_DOWNLOAD_FAILED",error);
    return sendJson(res,503,{error:"Não foi possível baixar a atualização."});
  }
}
