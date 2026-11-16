const steps=new Set(['materials','sources','analysis','outline','parameters','content']);
const templates=new Set(['government','enterprise','industrial','hi_tech','infrastructure','eco_environmental','commercial_realestate']);
const fields=['projectName','industry','constructionUnit','location','constructionContent','constructionPeriodYears','operationPeriodYears','totalInvestment','fundingSource'];
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validOutline(roots){
 const seen=new Set(),stack=roots.map(node=>({node,depth:1}));
 while(stack.length){const {node,depth}=stack.pop();if(!isObject(node)||depth>100||typeof node.id!=='string'||!node.id.trim()||node.id.length>256||seen.has(node.id)||typeof node.title!=='string'||!node.title.trim()||('description' in node&&typeof node.description!=='string')||('content' in node&&typeof node.content!=='string')||('children' in node&&!Array.isArray(node.children)))return false;seen.add(node.id);if(seen.size>5000)return false;for(const child of node.children||[])stack.push({node:child,depth:depth+1});}
 return true;
}
export function validFeasibilityState(state){
 if(!isObject(state)||!steps.has(state.step)||!templates.has(state.outlineTemplate)||!isObject(state.projectInfo)||!['government','enterprise'].includes(state.projectInfo.projectType)||!fields.every(key=>typeof state.projectInfo[key]==='string')||!Array.isArray(state.sourceFiles)||!Array.isArray(state.referenceDocumentIds)||!state.referenceDocumentIds.every(id=>typeof id==='string')||typeof state.analysisMarkdown!=='string'||typeof state.keyParametersMarkdown!=='string'||!Number.isSafeInteger(state.targetWords)||state.targetWords<1000)return false;
 if(state.outlineData!==null&&(!isObject(state.outlineData)||!Array.isArray(state.outlineData.outline)||!validOutline(state.outlineData.outline)))return false;
 return true;
}
