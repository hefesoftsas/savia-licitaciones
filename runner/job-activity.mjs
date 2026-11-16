const tools = ['read','write','edit','grep','find','ls','json-validation','ask-user','report-failure'];
export const activityCodes = ['agent.console','preparing','reading','ocr','generating','document.start','document.end','chapter.start','chapter.end','ocr.page','job.succeeded','job.failed', ...tools.flatMap(tool=>[`tool.${tool}.start`,`tool.${tool}.end`,`tool.${tool}.error`])];
export function validActivity(events) {
 return Array.isArray(events)&&events.length<=100&&events.every(event=>event&&typeof event==='object'&&Number.isSafeInteger(event.sequence)&&event.sequence>0&&event.sequence<=10000&&activityCodes.includes(event.code)&&typeof event.at==='string'&&event.at.length<40&&Number.isFinite(Date.parse(event.at))&&(!event.details||JSON.stringify(activityDetails(event.details))===JSON.stringify(event.details)));
}
export function activityDetails(input={}) {
 const result={};
 if(typeof input.text==='string')result.text=input.text.slice(0,8000);
 for(const key of ['document','chapter','path','event','tool','callId'])if(typeof input[key]==='string')result[key]=input[key].replace(/[\u0000-\u001f]/g,' ').slice(0,300);
 for(const key of ['page','totalPages','index','total','part','totalParts'])if(Number.isSafeInteger(input[key])&&input[key]>=0)result[key]=input[key];
 return result;
}
