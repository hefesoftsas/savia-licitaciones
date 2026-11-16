'use strict';

function dateOnly(value) {
  const text=String(value||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return '';
  const date=new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text?text:'';
}

function buildPreflightChecklist({tender,requirements=[],supports=[],certificates=[],offer,tasks=[]}) {
  const items=[];const process=tender?.process||{};const deadline=dateOnly(process.deadline);
  const verifiedDeadline=process.deadlineVerified===true?deadline:'';
  const add=(code,target,title='',extra={})=>items.push({code,target,title,...extra});
  if(!deadline)add('deadline_missing','details');
  else if(!verifiedDeadline)add('deadline_unverified','details','',{date:deadline});
  else add('deadline_recorded','details','',{date:deadline});
  if(!requirements.length)add('requirements_missing','requirements');
  for(const requirement of requirements){
    if(requirement.status!=='meets')add('requirement_pending','requirements',requirement.title,{requirementId:requirement.id,status:requirement.status});
    const related=supports.filter(item=>item.requirementId===requirement.id);
    if(!related.length)add('support_not_recorded','requirements',requirement.title,{requirementId:requirement.id});
    for(const support of related){
      const context={requirementId:requirement.id,supportId:support.id};
      if(support.status==='missing')add('support_missing','requirements',support.title,context);
      else if(support.status!=='reviewed')add('support_pending','requirements',support.title,context);
      if(!support.certificateId)continue;
      if(support.certificateAvailable===false){add('support_unavailable','requirements',support.title,context);continue;}
      const cert=certificates.find(item=>item.certificateId===support.certificateId);
      if(!cert){add('support_validity_unknown','requirements',support.title,context);continue;}
      const end=dateOnly(cert.validTo),start=dateOnly(cert.validFrom);
      if(cert.validityMode==='long-term')add('support_long_term','requirements',support.title,context);
      else if(cert.validityMode!=='range')add('support_validity_unknown','requirements',support.title,context);
      else if(start&&end&&start>end)add('support_validity_unknown','requirements',support.title,context);
      else if(verifiedDeadline&&end&&end<verifiedDeadline)add('support_expires_before_deadline','requirements',support.title,{...context,date:end});
      else if(verifiedDeadline&&start&&start>verifiedDeadline)add('support_starts_after_deadline','requirements',support.title,{...context,date:start});
      else if(verifiedDeadline&&start&&end&&start<=verifiedDeadline&&end>=verifiedDeadline)add('support_dates_cover_deadline','requirements',support.title,{...context,date:end});
      else add('support_validity_unknown','requirements',support.title,context);
    }
  }
  if(!offer?.draft?.items?.length)add('offer_missing','economic-offer');
  else if(offer.error||!offer.calculation)add('offer_invalid','economic-offer');
  else add('offer_recorded','economic-offer','',{total:offer.calculation.total});
  for(const task of tasks)if(!task.completed)add('task_pending','tasks',task.title,{date:dateOnly(task.dueDate)});
  return {items};
}
module.exports={buildPreflightChecklist};
