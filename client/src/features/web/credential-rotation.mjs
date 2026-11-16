const cursorPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// The server owns all persistent state; this cursor lasts only for this session.
export async function rotateAccountCredentials({ownerId,send,signal,maxPages=100}) {
  let cursor,rotated=0,failed=0;
  for(let page=0;page<maxPages;page++) {
    signal?.throwIfAborted();
    const result=await send({ownerId,...(cursor?{cursor}:{})});
    signal?.throwIfAborted();
    if(!result||!Number.isSafeInteger(result.rotated)||result.rotated<0||!Number.isSafeInteger(result.failed)||result.failed<0||result.rotated+result.failed>50)throw new Error('Invalid rotation response.');
    rotated+=result.rotated;failed+=result.failed;
    if(result.nextCursor===undefined)return {rotated,failed,complete:true};
    if(typeof result.nextCursor!=='string'||!cursorPattern.test(result.nextCursor)||(cursor&&result.nextCursor<=cursor))throw new Error('Invalid rotation cursor.');
    cursor=result.nextCursor;
  }
  return {rotated,failed,complete:false};
}
