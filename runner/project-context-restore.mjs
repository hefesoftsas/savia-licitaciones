const invalid=()=>{throw new Error('Los análisis o hechos de la captura no son válidos.');};
const text=(value,max,required=false)=>typeof value==='string' && value.length<=max && (!required || !!value.trim());
const categories={'project-overview':'projectOverview','technical-score':'techRequirements','response-requirements':'responseFileRequirements'};

export function validateProjectContext(context) {
 if(!context || !(context.facts===null || (context.facts && Array.isArray(context.facts.groups))) || !Array.isArray(context.analyses) || !Array.isArray(context.importedAnalyses))invalid();
 const groups=context.facts?.groups || [],ids=new Set();
 if(groups.length>500)invalid();
 for(const group of groups){if(!group || !text(group.id,256,true) || ids.has(group.id) || !text(group.title,20000) || !text(group.content,1000000))invalid();ids.add(group.id);}
 const analyses=[];
 for(const item of context.importedAnalyses){if(!item || !text(item.id,256,true) || !text(item.label,20000) || !text(item.status,100) || !text(item.content,1000000) || !(item.error===null || text(item.error,20000)) || !Number.isSafeInteger(item.sortOrder))invalid();analyses.push({id:item.id,label:item.label,status:item.status,content:item.content,error:item.error,sortOrder:item.sortOrder});}
 const seen=new Set();
 for(const item of context.analyses){if(!item || !Object.hasOwn(categories,item.category) || seen.has(item.category) || !text(item.content,1000000))invalid();seen.add(item.category);analyses.push({id:categories[item.category],label:'',status:'success',content:item.content,error:null,sortOrder:analyses.length});}
 if(analyses.length>500 || JSON.stringify(analyses).length>3000000 || JSON.stringify(groups).length>3000000)invalid();
 return {groups,analyses};
}

export async function restoreProjectContext({context,server,requestId,send}) {
 const {groups,analyses}=validateProjectContext(context),base=`${server}/api/runner/imports/technical-plan/${requestId}`;
 if(groups.length)await send(`${base}/facts`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({groups})});
 if(analyses.length)await send(`${base}/analyses`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({analyses})});
}
