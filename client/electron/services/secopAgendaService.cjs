'use strict';
function validDate(value) {
  const date = String(value || '').slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10) === date ? date : '';
}
function buildAgenda({tenders,tasks,certificates,watchBaselines=[]}) {
  const items=[]; const byId = new Map(tenders.map(item=>[item.id,item]));
  const watched=new Map(watchBaselines.map(item=>[item.processId,item]));
  for(const tender of tenders) {
    const baseline=watched.get(tender.id),observed=validDate(baseline?.deadline),saved=validDate(tender.process.deadline);
    const verifiedObserved=baseline?.deadlineVerified===true&&observed,verifiedSaved=tender.process.deadlineVerified===true&&saved;
    const date = tender.process.source === 'secop-ii' && (verifiedObserved || verifiedSaved || observed || saved);
    const fromWatch=Boolean(verifiedObserved || (!verifiedSaved && observed));
    if(date) items.push({id:`deadline:${tender.id}`,kind:'deadline',title:tender.process.title||tender.id,date,processId:tender.id,deadlineSource:fromWatch?'watch':'saved',deadlineVerified:Boolean(verifiedObserved||verifiedSaved),checkedAt:baseline?.checkedAt||'',watchError:baseline?.error||''});
  }
  for(const task of tasks) {
    const date=validDate(task.dueDate); if(!task.completed && date && byId.has(task.processId)) items.push({id:`task:${task.id}`,kind:'task',title:task.title,date,processId:task.processId,processTitle:byId.get(task.processId).process.title||task.processId});
  }
  for(const cert of certificates) {
    const date=cert.validityMode==='range' && validDate(cert.validTo);
    if(date)items.push({id:`certificate:${cert.certificateId}`,kind:'certificate',title:cert.name||'Certificado',date});
  }
  return items.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'es'));
}
function createAgendaNoticeSchema(db) { db.exec('CREATE TABLE IF NOT EXISTS secop_agenda_notices (notice_key TEXT PRIMARY KEY, shown_at TEXT NOT NULL)'); }
function createSecopAgendaService({db,library,credentialService,getWatchBaselines=()=>[],notify=()=>{},clock=()=>new Date()}) {
  let timer;
  const getState=()=>{
    const tenders=library.list();
    return buildAgenda({tenders,tasks:tenders.flatMap(tender=>library.listWorkTasks(tender.id)),certificates:credentialService.load().certificates,watchBaselines:getWatchBaselines()});
  };
  function remind() {
    const now=clock();const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
    const today=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day));
    const day=now.toISOString();
    const pending=[];
    for(const item of getState()) {
      if(item.kind==='deadline'&&!item.deadlineVerified)continue;
      const days=Math.round((Date.parse(`${item.date}T00:00:00Z`)-today)/86400000);
      if(days<0 || days>(item.kind==='certificate'?30:3))continue;
      const key=`${item.id}:${item.date}`;
      if(db.prepare('SELECT notice_key FROM secop_agenda_notices WHERE notice_key = ?').get(key))continue;
      pending.push({item,days,key});
    }
    if(pending.length && notify(pending)!==false) { const insert=db.prepare('INSERT OR IGNORE INTO secop_agenda_notices (notice_key, shown_at) VALUES (?,?)'); for(const entry of pending) insert.run(entry.key,day); }
  }
  function start(){if(timer)return;remind();timer=setInterval(remind,60*60*1000);timer.unref?.();}
  function close(){if(timer)clearInterval(timer);timer=null;}
  return {getState,remind,start,close};
}
module.exports={buildAgenda,createAgendaNoticeSchema,createSecopAgendaService};
