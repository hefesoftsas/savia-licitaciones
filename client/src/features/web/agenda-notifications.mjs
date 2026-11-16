export async function deliverAgendaNotifications({reminders,claim,notify,ack,release}){
 const pending=reminders.filter(reminder=>!reminder.notified);let failed=false;
 for(let offset=0;offset<pending.length;offset+=20){
  const claimed=[];
  for(const reminder of pending.slice(offset,offset+20)){try{const result=await claim(reminder.id);claimed.push({reminder,token:result.token});}catch(error){if(error?.status!==409)failed=true;}}
  if(!claimed.length)continue;
  try{await notify(claimed.map(item=>item.reminder));}catch{await Promise.allSettled(claimed.map(item=>release(item.reminder.id,item.token)));return {failed:true};}
  const confirmed=await Promise.allSettled(claimed.map(item=>ack(item.reminder.id,item.token)));if(confirmed.some(item=>item.status==='rejected'))failed=true;
 }
 return {failed};
}
