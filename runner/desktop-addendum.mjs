// These are historical suggestions; importing them must not assert that sources are current.
export function readDesktopAddendum(db,hasTable,processId){
 const runsPresent=hasTable('addendum_impact_runs'),reviewsPresent=hasTable('addendum_impact_reviews');
 if(!runsPresent&&!reviewsPresent)return {runs:[],available:false};
 if(!runsPresent||!reviewsPresent)throw new Error('El historial de adendas del respaldo está incompleto.');
 if(!processId)return {runs:[],available:true};
 const rows=db.prepare('SELECT * FROM addendum_impact_runs WHERE process_id=? ORDER BY created_at,id').all(processId);if(rows.length>10000)throw new Error('El historial de adendas supera el límite de inspección.');
 const readReviews=db.prepare('SELECT impact_id,status,note,updated_at FROM addendum_impact_reviews WHERE run_id=? ORDER BY rowid');
 const runs=rows.map(row=>{
  const reviews=readReviews.all(row.id).map(review=>({impactId:review.impact_id,status:review.status,note:review.note,updatedAt:review.updated_at}));if(reviews.length>10000)throw new Error('El historial de adendas supera el límite de inspección.');
  let sources=null,result=null,issue=null;try{if(typeof row.sources_json!=='string'||row.sources_json.length>3_000_000||typeof row.result_json==='string'&&row.result_json.length>10_000_000)throw Error('invalid');sources=JSON.parse(row.sources_json);result=row.result_json==null?null:JSON.parse(row.result_json);if(!sources||typeof sources!=='object'||Array.isArray(sources)||result!==null&&(typeof result!=='object'||Array.isArray(result)))throw Error('invalid');}catch{issue='invalid_json';}
  const impactIds=new Set(Array.isArray(result?.impacts)?result.impacts.map(impact=>impact?.id):[]),orphanReviewCount=reviews.filter(review=>!impactIds.has(review.impactId)).length;
  return {id:row.id,status:row.status==='running'?'interrupted':row.status,originalStatus:row.status,sourceHash:row.source_hash,sources,result,error:row.error||'',createdAt:row.created_at,updatedAt:row.updated_at,reviews,orphanReviewCount,...(issue?{issue,rawSources:row.sources_json,rawResult:row.result_json}:{}),historical:true};
 });return {runs,available:true};
}
