function required(name){const value=String(process.env[name]||"").trim();if(!value)throw new Error(name+" ausente");return value;}
function cfg(){return{url:required("SUPABASE_URL").replace(/\/+$/,""),key:required("SUPABASE_SERVICE_ROLE_KEY")};}
async function sb(path,{method="GET",body,prefer=""}={}){
  const{url,key}=cfg();
  const r=await fetch(url+"/rest/v1/"+path,{method,headers:{apikey:key,Authorization:"Bearer "+key,...(body!==undefined?{"Content-Type":"application/json"}:{}),...(prefer?{Prefer:prefer}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  if(!r.ok)throw new Error("Supabase "+r.status+": "+(await r.text()).slice(0,500));
  if(r.status===204)return null;const text=await r.text();return text?JSON.parse(text):null;
}
function recipients(type,p){
  if(type==="Bounce")return(p.bounce?.bouncedRecipients||[]).map(x=>x.emailAddress).filter(Boolean);
  if(type==="Complaint")return(p.complaint?.complainedRecipients||[]).map(x=>x.emailAddress).filter(Boolean);
  if(type==="Delivery")return(p.delivery?.recipients||[]).filter(Boolean);
  return[];
}
async function processNotification(p){
  const type=String(p.notificationType||p.eventType||""),mail=p.mail||{},id=String(mail.messageId||"");
  const recips=recipients(type,p).map(x=>String(x).toLowerCase());
  if(!type||!id)return;
  const status=type==="Bounce"?"bounced":type==="Complaint"?"complained":type==="Delivery"?"delivered":null;
  if(status)await sb("mail_messages?provider_message_id=eq."+encodeURIComponent(id),{method:"PATCH",prefer:"return=minimal",body:{status,updated_at:new Date().toISOString()}});
  await sb("mail_events",{method:"POST",prefer:"return=minimal",body:(recips.length?recips:[null]).map(recipient=>({provider_message_id:id,event_type:type.toLowerCase(),recipient,payload:p}))});
  const permanent=type==="Bounce"&&String(p.bounce?.bounceType||"").toLowerCase()==="permanent";
  if(permanent||type==="Complaint"){
    await sb("mail_blocklist?on_conflict=email",{method:"POST",prefer:"resolution=merge-duplicates,return=minimal",body:recips.map(email=>({email,reason:type==="Complaint"?"complaint":"permanent_bounce",source_message_id:id,metadata:p,blocked_at:new Date().toISOString()}))});
  }
}
export const handler=async(event)=>{
  for(const record of event.Records||[]){
    let envelope=JSON.parse(record.body||"{}");
    if(typeof envelope.Message==="string")envelope=JSON.parse(envelope.Message);
    await processNotification(envelope);
  }
  return{ok:true};
};
