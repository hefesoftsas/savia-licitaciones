export const navigationIds=['projects','feasibility','secop','market','agenda','company-profile','company-experience','company-certificates','rup','knowledge','images','duplicate-reviews','rejection-reviews','export-format','runners','credentials'];
export function defaultNavigation(){return [
 {id:'tenders',name:'',items:['secop','projects','feasibility','market','agenda']},
 {id:'company',name:'',items:['company-profile','company-experience','company-certificates','rup']},
 {id:'resources',name:'',items:['knowledge','images','export-format']},
 {id:'tools',name:'',items:['duplicate-reviews','rejection-reviews','runners','credentials']},
];}
export function validNavigation(groups){
 if(!Array.isArray(groups)||!groups.length||groups.length>20)return false;
 const ids=new Set(),items=[];
 for(const group of groups){if(!group||typeof group.id!=='string'||!group.id||group.id.length>80||ids.has(group.id)||typeof group.name!=='string'||group.name.length>60||(!group.name.trim()&&!['tenders','company','resources','tools'].includes(group.id))||!Array.isArray(group.items))return false;ids.add(group.id);items.push(...group.items);}
 return items.length===navigationIds.length&&new Set(items).size===items.length&&items.every(id=>navigationIds.includes(id));
}
export function moveNavigationItem(groups,item,target,before){
 const next=groups.map(group=>({...group,items:group.items.filter(id=>id!==item)}));
 const group=next.find(group=>group.id===target);if(!group)return groups;
 const index=before?group.items.indexOf(before):-1;group.items.splice(index<0?group.items.length:index,0,item);return next;
}
export function matchesNavigation(label,query){const normalize=value=>value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();return normalize(label).includes(normalize(query.trim()));}

// Older accounts may still have the assistant in their saved sidebar layout.
export function migrateNavigation(groups){
 if(!Array.isArray(groups))return groups;
 const next=groups.map(group=>group&&Array.isArray(group.items)?{...group,items:group.items.filter(id=>id!=='assistant')}:group);
 if(!next.some(group=>group?.items?.includes('rup'))){const company=next.find(group=>group?.id==='company')||next.find(group=>group?.items?.includes('company-profile'));if(company)company.items.push('rup');else if(next[0]?.items)next[0].items.push('rup');}
 return next;
}
