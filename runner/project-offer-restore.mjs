const text=(value,max)=>typeof value==='string' && value.length<=max;
export function validateProjectOffer(offer) {
 if(offer===null)return;
 const draft=offer?.draft;
 if(!offer || !text(offer.updatedAt,100) || !offer.updatedAt || !draft || typeof draft!=='object' || Array.isArray(draft) || !text(draft.currency,100) || !text(draft.budget,100) || !Array.isArray(draft.items) || draft.items.length>500 || draft.items.some(item=>!item || !text(item.id,100) || !text(item.name,1000) || !['quantity','price','rate','cost'].every(key=>text(item[key],100)) || (item.discount!==undefined && !text(item.discount,100))) || JSON.stringify(draft).length>200000) throw new Error('La oferta económica de la captura no es válida.');
}
export async function restoreProjectOffer({offer,server,requestId,send}) {
 validateProjectOffer(offer);if(offer===null)return;
 await send(`${server}/api/runner/imports/technical-plan/${requestId}/economic-offer`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(offer)});
}
