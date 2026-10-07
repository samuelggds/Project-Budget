import { applyCors, sendJson, apiBaseUrl } from "../_lib/security.mjs";
const OWNER="samuelggds", REPO="Project-Budget";
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
    const rr=await fetch("https://api.github.com/repos/"+OWNER+"/"+REPO+"/releases/latest",{headers:headers(),cache:"no-store"});
    if(rr.status===404){res.statusCode=204;return res.end();}
    if(!rr.ok) throw new Error("GitHub release "+rr.status);
    const release=await rr.json();
    const asset=(release.assets||[]).find((x)=>x.name==="latest.json");
    if(!asset){res.statusCode=204;return res.end();}
    const mr=await fetch(asset.url,{headers:headers("application/octet-stream"),cache:"no-store"});
    if(!mr.ok) throw new Error("latest.json "+mr.status);
    const manifest=await mr.json();
    const base=apiBaseUrl(req);
    for(const platform of Object.values(manifest.platforms||{})){
      if(!platform?.url) continue;
      let filename="";
      try{filename=decodeURIComponent(new URL(platform.url).pathname.split("/").pop()||"");}
      catch{filename=String(platform.url).split("/").pop()||"";}
      if(filename) platform.url=base+"/api/updates/download?asset="+encodeURIComponent(filename);
    }
    res.statusCode=200;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","public, max-age=60, s-maxage=300");res.end(JSON.stringify(manifest));
  }catch(error){
    console.error("TAURI_LATEST_FAILED",error);
    return sendJson(res,503,{error:"Atualizações temporariamente indisponíveis."});
  }
}
