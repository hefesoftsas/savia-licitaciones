export const views = ['account','admin','export-format','company-experience','company-profile','projects','runners','credentials','rup','secop','knowledge','agenda','company-certificates','market','images','duplicate-reviews','rejection-reviews'];
export const projectTabs = ['documents','chat','prepare','tracking','reviews','history','feasibility'];
export const preparationSteps = ['documents','analysis','outline','facts','draft','delivery'];
export function readNavigation(search) {
 const params=new URLSearchParams(search), rawView=params.get('view'), view=views.includes(rawView)?rawView:'projects';
 const rawTab=params.get('tab'), tab=projectTabs.includes(rawTab)?rawTab:'documents';
 const rawStep=params.get('step'), step=preparationSteps.indexOf(rawStep==='management'?'delivery':rawStep);
 const project=params.get('project')||'', inProject=view==='projects'&&!!project;
 let projectMode=null;
 if(inProject && projectTabs.includes(rawTab)){
  projectMode=tab==='prepare' && params.get('mode')==='autopilot' ? 'autopilot' : 'detailed';
 }
 const review=params.get('review');
 const reviewFocus=inProject&&tab==='reviews'&&['duplicates','rejection'].includes(review)?review:null;
 return {view,project,tab,projectMode,reviewFocus,step:step<0?null:step,opportunity:params.get('opportunity')==='suggestions'?'suggestions':'search'};
}
export function navigationSearch({view,project,tab,step,opportunity,projectMode,reviewFocus}) {
 const params=new URLSearchParams();params.set('view',view);
 if(view==='projects'&&project){params.set('project',project);params.set('tab',tab);if(tab==='tracking'){const current=new URLSearchParams(globalThis.location?.search||'');const value=current.get('tracking');if(current.get('project')===project&&['prepare','submit','after'].includes(value))params.set('tracking',value);}if(tab==='prepare'&&Number.isInteger(step)&&preparationSteps[step]){params.set('step',preparationSteps[step]);const current=new URLSearchParams(globalThis.location?.search||'');if(current.get('project')===project&&current.get('tab')==='prepare'){for(const key of ['expanded','word','wordMode'])if(current.has(key))params.set(key,current.get(key));if(current.get('step')===preparationSteps[step])for(const key of ['analysis','outline'])if(current.has(key))params.set(key,current.get(key));}}}
 if(view==='projects'&&project){
  if(tab==='prepare' && projectMode==='autopilot')params.set('mode','autopilot');
  if(tab==='reviews'&&['duplicates','rejection'].includes(reviewFocus))params.set('review',reviewFocus);
 }
 if(view==='secop'){params.set('opportunity',opportunity);const current=new URLSearchParams(globalThis.location?.search||'');for(const key of ['search','dataset','keyword','department','modality','status','fromDate','minValue','maxValue','sortBy','sortDirection','filters'])for(const value of current.getAll(key))params.append(key,value);}
 return `?${params}`;
}
