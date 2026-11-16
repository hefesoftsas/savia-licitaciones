import {validAddendumHistory} from './project-addendum-history.mjs';
import { Readable } from 'node:stream';
import { createComponentSnapshot } from './cloud-snapshot-archive.mjs';
import { imageReferences } from './desktop-assets.mjs';
import { prepareBlindCapture } from './project-blind-capture.mjs';
import { prepareReviewCapture } from './project-review-capture.mjs';
import { prepareSubmissionCapture } from './project-submission-capture.mjs';
import { prepareOfferDocumentsCapture } from './project-offer-documents-capture.mjs';
import { validateOfferDocuments } from './project-offer-documents-restore.mjs';
import {validProjectRejectionDraft} from './project-rejection-draft-restore.mjs';

// Partial capture only: the caller must not present this as an account backup.
export async function captureProjectComponents({server,token,projectId,destination,fetchImpl=fetch}) {
  if (typeof projectId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(projectId)) throw new Error('Proyecto inválido.');
  const base = `${server}/api/runner/project-captures/${encodeURIComponent(projectId)}`;
  async function request(url) {
    const response = await fetchImpl(url, {headers:{authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(300000)});
    if (!response.ok) throw new Error(`No se pudo capturar el proyecto (HTTP ${response.status}).`);
    return response;
  }
  const capture = await (await request(base)).json();
  const blind = await prepareBlindCapture({server,token,projectId,fetchImpl});
  const reviews = await prepareReviewCapture({server,token,projectId,fetchImpl});
  const submissionCapture=await prepareSubmissionCapture({server,token,projectId,fetchImpl});
  const {objects:submissionObjects,assertUnchanged:assertSubmissionUnchanged,...submission}=submissionCapture;
  const hasAddenda=Object.hasOwn(capture,'addenda');
  if(hasAddenda&&!validAddendumHistory(capture.addenda))throw new Error('El historial de adendas excede los límites de restauración.');
  const hasRejectionDraft=Object.hasOwn(capture,'rejectionDraft');
  if(hasRejectionDraft&&!validProjectRejectionDraft(capture.rejectionDraft))throw new Error('Borrador de rechazo inválido.');
  if (capture.complete !== false || capture.project?.id !== projectId || !/^[a-f0-9]{64}$/.test(capture.revision || '') || !Array.isArray(capture.files) || !Array.isArray(capture.assets) || !Array.isArray(capture.knowledge?.documents) || !Array.isArray(capture.libraryImages) || !Array.isArray(capture.technicalPlan?.nodes)) throw new Error('Respuesta de captura inválida.');
  const offerCapture=await prepareOfferDocumentsCapture({server,token,projectId,files:capture.files,fetchImpl});
  const {assertUnchanged:assertOfferUnchanged,...offerDocuments}=offerCapture;
  validateOfferDocuments({offer:offerDocuments,files:capture.files,objects:new Map(capture.files.map(file=>[file.id,{size:file.size,sha256:'0'.repeat(64)}])),workflow:capture.workflow,supports:capture.requirementSupports});
  const comparisons=capture.included?.includes('project-comparisons')?capture.comparisons:[];
  const evaluations=capture.included?.includes('project-evaluations')?capture.evaluations:[];
  if(!Array.isArray(evaluations))throw new Error('Evaluaciones de captura inválidas.');
  if(!Array.isArray(comparisons))throw new Error('Comparaciones de captura inválidas.');
  const assetReferences=new Set(capture.assets.filter(item=>item.kind==='url').map(item=>item.reference)), libraryById=new Map(capture.libraryImages.map(item=>[item.id,item])), needed=new Set();
  for(const node of capture.technicalPlan.nodes) for(const image of imageReferences(node.content || '')) {
    if(image.kind!=='url' || assetReferences.has(image.reference))continue;
    const match=/^\/api\/image-library\/([a-f0-9-]{36})\/file$/i.exec(image.reference || '');
    if(match)needed.add(match[1]);
  }
  const libraryImages=[...needed].map(id=>{const image=libraryById.get(id);if(!image)throw new Error('Falta una imagen de biblioteca utilizada por el plan.');return image;});
  if(capture.files.length+capture.assets.length+capture.knowledge.documents.length+libraryImages.length+comparisons.filter(item=>item?.source).length+evaluations.filter(item=>item?.source).length>10000)throw new Error('La captura contiene demasiados archivos.');
  const objects = [...blind.objects,...reviews.objects,...submissionObjects];
  for (const file of capture.files) {
    if (!file || typeof file.id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(file.id) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > 1073741824 || typeof file.etag !== 'string' || !file.etag || !/^[a-f0-9]{64}$/.test(file.version || '')) throw new Error('Archivo de captura inválido.');
    const url = `${base}/files/${encodeURIComponent(file.id)}?etag=${encodeURIComponent(file.etag)}&version=${file.version}`;
    objects.push({id:file.id,size:file.size,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió el archivo.');return Readable.fromWeb(response.body);}});
  }
  for (const asset of capture.assets) {
    if (!asset || typeof asset.id !== 'string' || !/^[A-Za-z0-9._:-]{1,122}$/.test(asset.id) || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.size > 1073741824 || typeof asset.etag !== 'string' || !asset.etag || !/^[a-f0-9]{64}$/.test(asset.version || '') || !/^[a-f0-9]{64}$/.test(asset.content_hash || '')) throw new Error('Recurso de captura inválido.');
    const url = `${base}/assets/${encodeURIComponent(asset.id)}?etag=${encodeURIComponent(asset.etag)}&version=${asset.version}`;
    objects.push({id:`asset:${asset.id}`,size:asset.size,sha256:asset.content_hash,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió el recurso.');return Readable.fromWeb(response.body);}});
  }
  for (const doc of capture.knowledge.documents) {
    if (!doc || typeof doc.id !== 'string' || !/^[A-Za-z0-9._:-]{1,118}$/.test(doc.id) || !Number.isSafeInteger(doc.size) || doc.size < 0 || doc.size > 1073741824 || typeof doc.etag !== 'string' || !doc.etag || !/^[a-f0-9]{64}$/.test(doc.version || '')) throw new Error('Documento de conocimiento inválido.');
    const url = `${base}/knowledge/${encodeURIComponent(doc.id)}?etag=${encodeURIComponent(doc.etag)}&version=${doc.version}`;
    objects.push({id:`knowledge:${doc.id}`,size:doc.size,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió el documento.');return Readable.fromWeb(response.body);}});
  }
  for (const image of libraryImages) {
    if (!image || typeof image.id!=='string' || !/^[a-f0-9-]{36}$/i.test(image.id) || !Number.isSafeInteger(image.size) || image.size<0 || image.size>1073741824 || typeof image.etag!=='string' || !image.etag || !/^[a-f0-9]{64}$/.test(image.version || '')) throw new Error('Imagen de biblioteca inválida.');
    const url=`${base}/library/${encodeURIComponent(image.id)}?etag=${encodeURIComponent(image.etag)}&version=${image.version}`;
    objects.push({id:`library:${image.id}`,size:image.size,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió la imagen.');return Readable.fromWeb(response.body);}});
  }
  for(const comparison of comparisons){
    if(!comparison || typeof comparison.id!=='string' || !/^[A-Za-z0-9._:-]{1,117}$/.test(comparison.id))throw new Error('Comparación de captura inválida.');
    if(!comparison.source)continue;
    const source=comparison.source;
    if(!Number.isSafeInteger(source.size)||source.size<0||source.size>1073741824||typeof source.etag!=='string'||!source.etag||!/^[a-f0-9]{64}$/.test(source.version||''))throw new Error('Fuente de comparación inválida.');
    const url=`${base}/comparisons/${encodeURIComponent(comparison.id)}?etag=${encodeURIComponent(source.etag)}&version=${source.version}`;
    objects.push({id:`comparison:${comparison.id}`,size:source.size,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió la fuente de comparación.');return Readable.fromWeb(response.body);}});
  }
  for(const evaluation of evaluations){
    if(!evaluation || typeof evaluation.id!=='string' || !/^[A-Za-z0-9._:-]{1,117}$/.test(evaluation.id))throw new Error('Evaluación de captura inválida.');
    if(!evaluation.source)continue;
    const source=evaluation.source;
    if(!Number.isSafeInteger(source.size)||source.size<0||source.size>25*1024*1024||typeof source.etag!=='string'||!source.etag||!/^[a-f0-9]{64}$/.test(source.version||'')||!/^[a-f0-9]{64}$/.test(source.sha256||''))throw new Error('Informe de evaluación inválido.');
    const url=`${base}/evaluations/${encodeURIComponent(evaluation.id)}?etag=${encodeURIComponent(source.etag)}&version=${source.version}`;
    objects.push({id:`evaluation:${evaluation.id}`,size:source.size,sha256:source.sha256,open:async()=>{const response=await request(url);if(!response.body)throw new Error('No se recibió el informe de evaluación.');return Readable.fromWeb(response.body);}});
  }
  return createComponentSnapshot(destination, {
    metadata:{...(hasAddenda?{addenda:capture.addenda}:{}),project:capture.project,files:capture.files,assets:capture.assets,knowledge:capture.knowledge,libraryImages,workflow:capture.workflow,technicalPlan:capture.technicalPlan,context:capture.context,chat:capture.chat,secop:capture.secop,offer:capture.offer,offerDocuments,blindProfile:capture.blindProfile,comparisons,evaluations,blindTasks:blind.tasks,reviewTasks:reviews.tasks,submission,...(hasRejectionDraft?{rejectionDraft:capture.rejectionDraft}:{}),...(capture.included?.includes('project-opportunity-tracking')?{opportunityTracking:capture.opportunityTracking}:{}),...(capture.included?.includes('project-requirement-supports')?{requirementSupports:capture.requirementSupports}:{}),revision:capture.revision},
    included:[...capture.included,'project-blind-tasks',...(hasRejectionDraft?['project-rejection-draft']:[]),'project-review-tasks','project-submission-tracking','project-offer-documents',...(hasAddenda?['project-addendum-history']:[])], omitted:capture.omitted, objects,
    beforeCommit:async()=>{const current=await (await request(base)).json();if(current.revision!==capture.revision)throw new Error('El proyecto cambió durante la captura.');await blind.assertUnchanged();await reviews.assertUnchanged();await assertSubmissionUnchanged();await assertOfferUnchanged();},
  });
}
