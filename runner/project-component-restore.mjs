import {validAddendumHistory,restoreAddendumHistory} from './project-addendum-history.mjs';
import {restoreAccountKnowledge} from './account-knowledge-restore.mjs';
import {validateAccountKnowledge} from './account-knowledge-capture.mjs';
import {validateProjectEvaluations,restoreProjectEvaluations} from './project-evaluation-restore.mjs';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { restoreLargeProjectFile } from './project-multipart-restore.mjs';
import { join } from 'node:path';
import { verifyComponentSnapshot } from './cloud-snapshot-archive.mjs';
import { validateKnowledgeSources, restoreKnowledgeSources } from './project-knowledge-restore.mjs';
import { validateProjectContext, restoreProjectContext } from './project-context-restore.mjs';
import { validateProjectChat, restoreProjectChat } from './project-chat-restore.mjs';
import { validateProjectSecop, checkProjectSecop, restoreProjectSecop } from './project-secop-restore.mjs';
import { validateProjectOffer, restoreProjectOffer } from './project-offer-restore.mjs';
import { validateProjectBlindProfile, restoreProjectBlindProfile } from './project-blind-profile-restore.mjs';
import { validateProjectComparisons, restoreProjectComparisons } from './project-comparison-restore.mjs';
import { validateProjectBlindTasks, restoreProjectBlindTasks } from './project-blind-restore.mjs';
import {validProjectRejectionDraft,restoreProjectRejectionDraft} from './project-rejection-draft-restore.mjs';
import {validateProjectReviewTasks,restoreProjectReviewTasks} from './project-review-restore.mjs';
import {validateProjectSubmission,restoreProjectSubmission} from './project-submission-restore.mjs';
import {validateOfferDocuments,restoreOfferDocuments} from './project-offer-documents-restore.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const invalid = () => { throw new Error('La captura parcial no es válida para recuperar estos componentes.'); };
const text = (value,max,required=false) => typeof value === 'string' && value.length <= max && (!required || !!value.trim());
function imageType(bytes) {
  const starts = values => values.every((value,index)=>bytes[index]===value);
  if (starts([137,80,78,71,13,10,26,10])) return 'image/png';
  if (starts([255,216,255])) return 'image/jpeg';
  if (starts([71,73,70,56,55,97]) || starts([71,73,70,56,57,97])) return 'image/gif';
  if (starts([82,73,70,70]) && bytes.length>=12 && [87,69,66,80].every((value,index)=>bytes[index+8]===value)) return 'image/webp';
  return null;
}
function validateWorkflow(workflow) {
  if (!workflow || !(workflow.stage === null || ['evaluating','preparing','submitted','awarded','not_awarded','discarded'].includes(workflow.stage)) || !(workflow.stageUpdatedAt === null || text(workflow.stageUpdatedAt,100)) || !Array.isArray(workflow.tasks) || !Array.isArray(workflow.requirements) || workflow.tasks.length > 500 || workflow.requirements.length > 500) invalid();
  const tasks = new Set(), requirements = new Set();
  for (const item of workflow.tasks) {
    const validDate = item?.dueDate === '' || (typeof item?.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) && !Number.isNaN(Date.parse(`${item.dueDate}T00:00:00Z`)) && new Date(`${item.dueDate}T00:00:00Z`).toISOString().slice(0,10) === item.dueDate);
    if (!item || !text(item.id,256,true) || tasks.has(item.id) || !text(item.title,300,true) || !validDate || typeof item.completed !== 'boolean' || !text(item.createdAt,100,true) || !text(item.updatedAt,100,true)) invalid();
    tasks.add(item.id);
  }
  for (const item of workflow.requirements) {
    if (!item || !text(item.id,256,true) || requirements.has(item.id) || !text(item.title,300,true) || !text(item.source,20000) || !text(item.evidence,300) || !['pending','meets','does_not_meet','unknown'].includes(item.status) || !['general','legal','financial','technical','experience'].includes(item.category) || !text(item.createdAt,100,true) || !text(item.updatedAt,100,true)) invalid();
    requirements.add(item.id);
  }
  if (JSON.stringify(workflow).length > 3000000) invalid();
}
function validatePlan(plan, workflow, title, availableKnowledge) {
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length > 500) invalid();
  const ids = new Set(), requirements = new Set(workflow.requirements.map(item=>item.id)), nodes = [];
  for (const row of plan.nodes) {
    if (!row || !text(row.id,128,true) || ids.has(row.id) || !(row.parentId === null || text(row.parentId,128,true)) || !Number.isSafeInteger(row.sortOrder) || row.sortOrder < 0 || !(row.attr === null || ['通用','商务/资信','技术','其他','目录','报价','业绩'].includes(row.attr)) || row.planJson !== null) invalid();
    for (const [key,max] of [['title',300],['description',2000],['content',1000000],['contentMode',100],['contentModeNote',2000],['sourceRequirementId',128],['sourceRequirementTitle',300]]) if (!text(row[key],max,key==='title')) invalid();
    let knowledge; try { knowledge = row.knowledgeIdsJson === null ? [] : JSON.parse(row.knowledgeIdsJson); } catch { invalid(); }
    if (!Array.isArray(knowledge)) invalid();
    if (knowledge.some(id=>typeof id!=='string' || !availableKnowledge.has(id)) || new Set(knowledge).size!==knowledge.length) throw new Error('Falta conocimiento vinculado al plan. No se creó ningún proyecto.');
    if (row.sourceRequirementId && !requirements.has(row.sourceRequirementId)) throw new Error('Falta un requisito vinculado al plan. No se creó ningún proyecto.');
    ids.add(row.id);
    nodes.push({id:row.id,parentId:row.parentId,sortOrder:row.sortOrder,title:row.title,description:row.description,content:row.content,contentMode:row.contentMode,contentModeNote:row.contentModeNote,sourceRequirementId:row.sourceRequirementId,sourceRequirementTitle:row.sourceRequirementTitle,attr:row.attr,...(knowledge.length?{knowledgeItemIds:knowledge}:{})});
  }
  const byId = new Map(nodes.map(node=>[node.id,node]));
  for (const node of nodes) { let parent=node.parentId, depth=1; const visited=new Set([node.id]); while(parent!==null){if(!byId.has(parent)||visited.has(parent)||++depth>10)invalid();visited.add(parent);parent=byId.get(parent).parentId;} }
  if (JSON.stringify({title,nodes}).length > 3000000) invalid();
  return nodes;
}

export async function restoreProjectComponents({server,token,directory,knowledgeDirectory,fetchImpl=fetch}) {
  const manifest = await verifyComponentSnapshot(directory);
  const metadataBytes = await readFile(join(directory,'metadata.json'));
  if (digest(metadataBytes) !== manifest.metadataSha256) invalid();
  const metadata = JSON.parse(metadataBytes.toString('utf8'));
  const hasAddenda=manifest.included.at(-1)==='project-addendum-history';
  const withoutAddenda=hasAddenda?manifest.included.slice(0,-1):manifest.included;
  if(hasAddenda&&!validAddendumHistory(metadata.addenda))invalid();
  const hasOfferDocuments=withoutAddenda.at(-1)==='project-offer-documents', withoutOffer=hasOfferDocuments?withoutAddenda.slice(0,-1):withoutAddenda;
  const hasSubmission=withoutOffer.at(-1)==='project-submission-tracking';
  const included = (hasSubmission?withoutOffer.slice(0,-1):withoutOffer).join(','), hasReviewTasks = included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations,project-opportunity-tracking,project-requirement-supports,project-blind-tasks,project-rejection-draft,project-review-tasks' || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations,project-opportunity-tracking,project-requirement-supports,project-blind-tasks,project-review-tasks', hasRejectionDraft = included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations,project-opportunity-tracking,project-requirement-supports,project-blind-tasks,project-rejection-draft' || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations,project-opportunity-tracking,project-requirement-supports,project-blind-tasks,project-rejection-draft,project-review-tasks', hasBlindTasks = hasReviewTasks || hasRejectionDraft || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations,project-opportunity-tracking,project-requirement-supports,project-blind-tasks', hasRequirementSupports = hasBlindTasks || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations,project-opportunity-tracking,project-requirement-supports', hasOpportunityTracking = hasRequirementSupports || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations,project-opportunity-tracking', hasEvaluations = hasOpportunityTracking || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons,project-evaluations', hasComparisons = hasEvaluations || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile,project-comparisons', hasBlindProfile = hasComparisons || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer,project-blind-profile', hasOffer = hasBlindProfile || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop,project-offer', hasSecop = hasOffer || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat,project-secop', hasChat = hasSecop || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context,project-chat', hasContext = hasChat || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images,project-context', hasLibrary = hasContext || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge,plan-library-images', hasKnowledge = hasLibrary || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets,project-knowledge', hasAssets = hasKnowledge || included === 'project-header,project-files,project-workflow,technical-plan-nodes,plan-assets', hasPlan = hasAssets || included === 'project-header,project-files,project-workflow,technical-plan-nodes', hasWorkflow = hasPlan || included === 'project-header,project-files,project-workflow';
  if(hasOfferDocuments&&!hasSubmission)invalid();
  if (hasSubmission&&!hasReviewTasks) invalid();
  if ((!hasWorkflow && included !== 'project-header,project-files') || manifest.omitted.join(',') !== 'other-project-data,other-account-data,credentials' || typeof metadata.project?.title !== 'string' || !metadata.project.title.trim() || metadata.project.title.length > 300 || !Array.isArray(metadata.files) || (hasAssets && !Array.isArray(metadata.assets)) || (hasKnowledge && !Array.isArray(metadata.knowledge?.documents)) || (hasLibrary && !Array.isArray(metadata.libraryImages)) || metadata.files.length+(hasAssets?metadata.assets.length:0)+(hasKnowledge?metadata.knowledge.documents.length:0)+(hasLibrary?metadata.libraryImages.length:0)+(hasComparisons && Array.isArray(metadata.comparisons)?metadata.comparisons.filter(item=>item?.source).length:0)+(hasEvaluations && Array.isArray(metadata.evaluations)?metadata.evaluations.filter(item=>item?.source).length:0)+(hasBlindTasks && Array.isArray(metadata.blindTasks)?metadata.blindTasks.reduce((count,item)=>count+Number(!!item?.artifact)+Number(!!item?.report),0):0)+(hasReviewTasks && Array.isArray(metadata.reviewTasks)?metadata.reviewTasks.filter(item=>item?.artifact).length:0)+(hasSubmission && Array.isArray(metadata.submission?.attachments)?metadata.submission.attachments.length:0)+(hasSubmission && Array.isArray(metadata.submission?.evidence)?metadata.submission.evidence.length:0) !== manifest.objects.length) invalid();
  if (hasOpportunityTracking && metadata.opportunityTracking !== null) { const item=metadata.opportunityTracking; if (!item || !['review','participate','discarded'].includes(item.decision) || typeof item.owner !== 'string' || item.owner.length > 120 || typeof item.notes !== 'string' || item.notes.length > 4000) invalid(); }
  if (hasRequirementSupports) { const ids=new Set(), requirements=new Set(metadata.workflow?.requirements?.map(x=>x.id) || []); if (!Array.isArray(metadata.requirementSupports) || metadata.requirementSupports.length>1000) invalid(); for(const x of metadata.requirementSupports) { if(!x || typeof x.id!=='string' || !x.id || x.id.length>256 || ids.has(x.id) || !requirements.has(x.requirementId) || typeof x.title!=='string' || !x.title.trim() || x.title.length>300 || !['missing','pending','reviewed'].includes(x.status) || !['none','certificate','rup','unresolved','unresolved-certificate','unresolved-rup'].includes(x.linkType) || typeof x.linkId!=='string' || x.linkId.length>259 || (x.linkType==='none')!==(x.linkId==='') || typeof x.createdAt!=='string' || !x.createdAt || x.createdAt.length>100) invalid(); ids.add(x.id); } }
  if (hasWorkflow) validateWorkflow(metadata.workflow);
  if (hasContext) validateProjectContext(metadata.context);
  if (hasChat) validateProjectChat(metadata.chat);
  if (hasSecop) validateProjectSecop(metadata.secop,metadata.files);
  if (hasOffer) validateProjectOffer(metadata.offer);
  if (hasBlindProfile) validateProjectBlindProfile(metadata.blindProfile);
  if (hasRejectionDraft&&!validProjectRejectionDraft(metadata.rejectionDraft)) invalid();
  const objects = new Map(manifest.objects.map(item=>[item.id,item]));
  if(hasOfferDocuments)validateOfferDocuments({offer:metadata.offerDocuments,files:metadata.files,objects,workflow:metadata.workflow,supports:metadata.requirementSupports});
  const availableKnowledge=hasKnowledge?await validateKnowledgeSources({knowledge:metadata.knowledge,objects,directory:join(directory,'objects')}):new Set();
  const planNodes = hasPlan ? validatePlan(metadata.technicalPlan,metadata.workflow,metadata.project.title,availableKnowledge) : [];
  const seen = hasComparisons ? validateProjectComparisons(metadata.comparisons,metadata.workflow,objects) : new Set();
  if(hasEvaluations){for(const id of await validateProjectEvaluations({evaluations:metadata.evaluations,objects,directory:join(directory,'objects')})){if(seen.has(id))invalid();seen.add(id);}}
  if(hasBlindTasks){for(const id of await validateProjectBlindTasks({tasks:metadata.blindTasks,objects,directory:join(directory,'objects')})){if(seen.has(id))invalid();seen.add(id);}}
  if(hasReviewTasks){for(const id of await validateProjectReviewTasks({tasks:metadata.reviewTasks,objects,directory:join(directory,'objects')})){if(seen.has(id))invalid();seen.add(id);}}
  if(hasSubmission){for(const id of await validateProjectSubmission({submission:metadata.submission,objects,directory:join(directory,'objects')})){if(seen.has(id))invalid();seen.add(id);}}
  for (const file of metadata.files) {
    const entry = objects.get(file?.id);
    if (!entry || seen.has(file.id) || entry.size !== file.size || file.size > 1024*1024*1024 || typeof file.name !== 'string' || !file.name.trim() || file.name.length > 255 || /[\x00-\x1f\x7f]/.test(file.name) || typeof file.content_type !== 'string' || !file.content_type || file.content_type.length > 200) invalid();
    seen.add(file.id);
  }
  const assetRefs = new Set();
  if (hasAssets) for (const asset of metadata.assets) {
    const id = `asset:${asset?.id}`, entry = objects.get(id), refKey = JSON.stringify([asset?.kind,asset?.reference]);
    if (!entry || seen.has(id) || assetRefs.has(refKey) || entry.size !== asset.size || entry.size > 25*1024*1024 || entry.sha256 !== asset.content_hash || !['url','agent'].includes(asset.kind) || !text(asset.reference,4096,true) || /[\x00-\x1f\x7f]/.test(asset.reference)) invalid();
    const bytes = await readFile(join(directory,'objects',entry.file));
    if (digest(bytes)!==entry.sha256 || imageType(bytes)!==asset.content_type) invalid();
    seen.add(id); assetRefs.add(refKey);
  }
  if (hasKnowledge) for (const doc of metadata.knowledge.documents) {
    const id=`knowledge:${doc.id}`;
    if (seen.has(id) || !objects.has(id)) invalid();
    seen.add(id);
  }
  if (hasLibrary) for (const image of metadata.libraryImages) {
    const id=`library:${image?.id}`,entry=objects.get(id),ref=`/api/image-library/${image?.id}/file`,refKey=JSON.stringify(['url',ref]);
    if (!image || !/^[a-f0-9-]{36}$/i.test(image.id || '') || !entry || seen.has(id) || assetRefs.has(refKey) || entry.size!==image.size || entry.size>25*1024*1024) invalid();
    const bytes=await readFile(join(directory,'objects',entry.file));
    if(digest(bytes)!==entry.sha256 || imageType(bytes)!==image.content_type)invalid();
    seen.add(id);assetRefs.add(refKey);
  }
  if (seen.size!==manifest.objects.length) invalid();
  if (knowledgeDirectory) {
    if (!hasKnowledge) throw new Error('El proyecto no contiene conocimiento para vincular.');
    const accountManifest=await verifyComponentSnapshot(knowledgeDirectory),account=JSON.parse(await readFile(join(knowledgeDirectory,'metadata.json'),'utf8'));
    if(accountManifest.included.join(',')!=='account-knowledge'||accountManifest.omitted.join(',')!=='other-account-data,credentials'||account.kind!=='account-knowledge')invalid();validateAccountKnowledge(account);
    const accountDocs=new Map(account.documents.map(item=>[item.id,item])),accountIndices=new Map(account.indices.map(item=>[item.document_id,item])),accountObjects=new Map(accountManifest.objects.map(item=>[item.id,item]));
    const canonicalEntries=(rows,doc)=>JSON.stringify(rows.filter(x=>x.document_id===doc).map(x=>({id:x.id,document_id:x.document_id,title:x.title,summary:x.summary,quote:x.quote,sort_order:x.sort_order})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0));
    for(const doc of metadata.knowledge.documents){const target=accountDocs.get(doc.id),sourceObject=objects.get(`knowledge:${doc.id}`),targetObject=accountObjects.get(`knowledge:${doc.id}`),sourceIndex=metadata.knowledge.indices.find(x=>x.document_id===doc.id),targetIndex=accountIndices.get(doc.id);if(!target||target.missing_reason!==null||['folder_id','name','content_type','size','created_at'].some(key=>doc[key]!==target[key])||!sourceObject||!targetObject||sourceObject.sha256!==targetObject.sha256||!sourceIndex||!targetIndex||sourceIndex.revision!==targetIndex.revision||canonicalEntries(metadata.knowledge.entries,doc.id)!==canonicalEntries(account.entries,doc.id))throw new Error('La biblioteca y el proyecto no contienen la misma versión del conocimiento. No se creó ningún proyecto.');}
  }
  const requestId = `cloud-components-${digest(JSON.stringify(manifest))}`;
  const auth = {authorization:`Bearer ${token}`};
  async function send(url,options,timeoutMs=60000) {
    const response = await fetchImpl(url,{...options,headers:{...auth,...options.headers},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
    if (!response.ok) { const error=new Error(`No se pudieron recuperar los componentes (HTTP ${response.status}). Repite el comando para continuar.`);error.status=response.status;throw error; }
    return response.json();
  }
  const base = `${server}/api/runner/imports/technical-plan`;
  if (hasSecop) await checkProjectSecop({secop:metadata.secop,files:metadata.files,server,requestId,send});
  const knowledgeMap=knowledgeDirectory?(await restoreAccountKnowledge({server,token,directory:knowledgeDirectory,fetchImpl})).entryMapping:hasKnowledge?await restoreKnowledgeSources({knowledge:metadata.knowledge,objects,directory:join(directory,'objects'),requestId,server,send}):new Map();
  if([...availableKnowledge].some(id=>!knowledgeMap.has(id)))throw new Error('Falta una entrada recuperada de la biblioteca. No se creó ningún proyecto.');
  const mappedNodes=planNodes.map(node=>node.knowledgeItemIds?{...node,knowledgeItemIds:node.knowledgeItemIds.map(id=>knowledgeMap.get(id))}:node);
  const result = await send(base,{method:'POST',headers:{'content-type':'application/json','idempotency-key':requestId},body:JSON.stringify({title:metadata.project.title,nodes:mappedNodes})});
  if (hasWorkflow) await send(`${base}/${requestId}/workflow`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(metadata.workflow)});
  for (const file of metadata.files) {
    const entry = objects.get(file.id), path=join(directory,'objects',entry.file), headers={'x-file-name':encodeURIComponent(file.name),'x-content-sha256':entry.sha256,'content-type':file.content_type};
    if (entry.size > 50*1024*1024) {
      await restoreLargeProjectFile({url:`${base}/${requestId}/files/${digest(file.id)}`,path,entry,name:file.name,contentType:file.content_type,send});
    } else if (entry.size > 25*1024*1024) {
      const body=createReadStream(path);
      try { await send(`${base}/${requestId}/files/${digest(file.id)}`,{method:'POST',headers:{...headers,'x-savia-stream-size':String(entry.size)},body,duplex:'half'},300000); }
      finally {body.destroy();}
    } else {
      const bytes=await readFile(path);
      if (bytes.length !== entry.size || digest(bytes) !== entry.sha256) throw new Error('El archivo local cambió durante la recuperación. Repite el comando.');
      await send(`${base}/${requestId}/files/${digest(file.id)}`,{method:'POST',headers,body:bytes});
    }
  }
  if (hasSecop) await restoreProjectSecop({secop:metadata.secop,files:metadata.files,server,requestId,send});
  if (hasAssets) for (const asset of metadata.assets) {
    const entry=objects.get(`asset:${asset.id}`), bytes=await readFile(join(directory,'objects',entry.file));
    if (bytes.length!==entry.size || digest(bytes)!==entry.sha256) throw new Error('El recurso local cambió durante la recuperación. Repite el comando.');
    const sourceKey=digest(JSON.stringify([asset.kind,asset.reference]));
    await send(`${base}/${requestId}/assets/${sourceKey}`,{method:'POST',headers:{'x-asset-reference':encodeURIComponent(asset.reference),'x-asset-kind':asset.kind,'x-content-sha256':entry.sha256,'content-type':'application/octet-stream'},body:bytes});
  }
  if (hasLibrary) for (const image of metadata.libraryImages) {
    const entry=objects.get(`library:${image.id}`),bytes=await readFile(join(directory,'objects',entry.file));
    if(bytes.length!==entry.size || digest(bytes)!==entry.sha256)throw new Error('La imagen local cambió durante la recuperación. Repite el comando.');
    const reference=`/api/image-library/${image.id}/file`,sourceKey=digest(JSON.stringify(['url',reference]));
    await send(`${base}/${requestId}/assets/${sourceKey}`,{method:'POST',headers:{'x-asset-reference':encodeURIComponent(reference),'x-asset-kind':'url','x-content-sha256':entry.sha256,'content-type':'application/octet-stream'},body:bytes});
  }
  if (hasContext) await restoreProjectContext({context:metadata.context,server,requestId,send});
  if (hasChat) await restoreProjectChat({messages:metadata.chat,server,requestId,send});
  if (hasOffer) await restoreProjectOffer({offer:metadata.offer,server,requestId,send});
  if (hasOpportunityTracking && metadata.opportunityTracking !== null) await send(`${base}/${requestId}/opportunity-tracking`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(metadata.opportunityTracking)});
  if (hasRequirementSupports) await send(`${base}/${requestId}/requirement-supports`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({items:metadata.requirementSupports})});
  if (hasBlindProfile) await restoreProjectBlindProfile({blindProfile:metadata.blindProfile,server,requestId,send});
  if(hasAddenda)await restoreAddendumHistory({runs:metadata.addenda,server,requestId,send});
  if (hasRejectionDraft) await restoreProjectRejectionDraft({draft:metadata.rejectionDraft,server,requestId,send});
  if (hasComparisons) await restoreProjectComparisons({comparisons:metadata.comparisons,workflow:metadata.workflow,objects,directory:join(directory,'objects'),server,requestId,send});
  if (hasEvaluations) await restoreProjectEvaluations({evaluations:metadata.evaluations,objects,directory:join(directory,'objects'),server,requestId,send});
  const blind=hasBlindTasks?await restoreProjectBlindTasks({tasks:metadata.blindTasks,objects,directory:join(directory,'objects'),server,requestId,send}):null;
  const reviews=hasReviewTasks?await restoreProjectReviewTasks({tasks:metadata.reviewTasks,objects,directory:join(directory,'objects'),server,requestId,send}):null;
  const submission=hasSubmission?await restoreProjectSubmission({submission:metadata.submission,objects,directory:join(directory,'objects'),server,requestId,send}):null;
  if(hasOfferDocuments)await restoreOfferDocuments({offer:metadata.offerDocuments,files:metadata.files,objects,workflow:metadata.workflow,supports:metadata.requirementSupports,server,requestId,send});
  return {projectId:result.project.id,files:metadata.files.length,omitted:manifest.omitted,...(blind?{blindTasks:blind}:{}),...(reviews?{reviewTasks:reviews}:{}),...(submission?{submission}: {})};
}
