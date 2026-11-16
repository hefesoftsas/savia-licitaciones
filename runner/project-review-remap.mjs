const remapId=(value,mapping)=>typeof value==='string'?(mapping.get(value)||`missing:${value}`):value;
const remapArray=(value,mapping)=>Array.isArray(value)?value.map(item=>remapId(item,mapping)):value;
const remapKeys=(value,mapping)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).map(([key,item])=>[remapId(key,mapping),item])):value;
const each=(value,fn)=>{if(Array.isArray(value))value.forEach(item=>{if(item&&typeof item==='object')fn(item);});};

export function remapReviewPayload(payload,mapping){
 const output=structuredClone(payload);
 for(const key of ['fileIds','tenderFileIds','bidFileIds'])if(Object.hasOwn(output,key))output[key]=remapArray(output[key],mapping);
 return output;
}
export function remapReviewResult(result,mapping,artifactId){
 if(result===null)return null;
 const output=structuredClone(result);each(output.sourceFiles,item=>{item.id=remapId(item.id,mapping);});
 if(Object.hasOwn(output,'artifactId'))delete output.artifactId;if(artifactId)output.artifactId=artifactId;
 return output;
}
export function remapReviewReport(kind,report,mapping){
 const output=structuredClone(report);each(output.sourceFiles,item=>{item.id=remapId(item.id,mapping);});
 if(kind==='duplicate-check.analyze'){
  for(const section of [output.metadataAnalysis?.files,output.metadataAnalysis?.contentFiles,output.outlineAnalysis?.files,output.imageAnalysis?.files])each(section,item=>{item.file_id=remapId(item.file_id,mapping);});
  each(output.metadataAnalysis?.rows,item=>{item.values=remapKeys(item.values,mapping);item.duplicate_file_ids=remapArray(item.duplicate_file_ids,mapping);item.same_day_file_ids=remapArray(item.same_day_file_ids,mapping);});
  each(output.outlineAnalysis?.duplicateGroups,item=>{item.file_ids=remapArray(item.file_ids,mapping);item.paths=remapKeys(item.paths,mapping);item.item_ids=remapKeys(item.item_ids,mapping);});
  each(output.outlineAnalysis?.pairwiseSimilarities,item=>{item.file_a_id=remapId(item.file_a_id,mapping);item.file_b_id=remapId(item.file_b_id,mapping);});
  each(output.contentAnalysis?.duplicateSentences,item=>{item.file_ids=remapArray(item.file_ids,mapping);item.occurrences=remapKeys(item.occurrences,mapping);});
  each(output.imageAnalysis?.duplicateImages,item=>{item.file_ids=remapArray(item.file_ids,mapping);item.occurrences=remapKeys(item.occurrences,mapping);item.locations=remapKeys(item.locations,mapping);});
 }else if(kind==='rejection-check.analyze'){
  for(const key of ['rejectionCheckResult','typoCheckResult','logicCheckResult'])each(output[key]?.findings,item=>{if(Object.hasOwn(item,'bidDocumentId'))item.bidDocumentId=remapId(item.bidDocumentId,mapping);});
 }
 return output;
}
