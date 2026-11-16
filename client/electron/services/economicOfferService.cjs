'use strict';

function createEconomicOfferSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS economic_offer_drafts (
    process_id TEXT PRIMARY KEY, draft_json TEXT NOT NULL, updated_at TEXT NOT NULL
  );`);
}

// Inputs use up to four decimal places. Monetary results round half up per line.
function decimal(value, name, optional = false) {
  const text=String(value ?? '').trim().replace(',','.');
  if (!text && optional) return null;
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(text)) throw Error(`${name}: escribe un número no negativo con hasta 4 decimales y sin separadores de miles.`);
  const [whole,fraction='']=text.split('.');
  return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
}
const round=(numerator,denominator)=>(numerator+denominator/2n)/denominator;
function amount(cents) {
  const sign=cents<0n?'-':'';const value=cents<0n?-cents:cents;
  return `${sign}${value/100n}.${String(value%100n).padStart(2,'0')}`;
}
function calculateOffer(draft) {
  const items=Array.isArray(draft?.items)?draft.items:[];
  let gross=0n,discount=0n,net=0n,tax=0n,total=0n,cost=0n,allCosts=items.length>0;
  const lines=items.map((item,index)=>{
    const name=String(item.name||'').trim();if(!name)throw Error(`Fila ${index+1}: indica una descripción.`);
    const quantity=decimal(item.quantity,`Fila ${index+1}: cantidad`),price=decimal(item.price,`Fila ${index+1}: precio unitario`),rate=decimal(item.rate,`Fila ${index+1}: porcentaje`);
    const unitCost=decimal(item.cost,`Fila ${index+1}: costo unitario`,true);
    const discountRate=decimal(item.discount,`Fila ${index+1}: descuento`,true)??0n;
    if(discountRate>1000000n)throw Error(`Fila ${index+1}: el descuento no puede superar el 100%.`);
    const lineGross=round(quantity*price,1000000n),lineDiscount=round(lineGross*discountRate,1000000n),lineNet=lineGross-lineDiscount,lineTax=round(lineNet*rate,1000000n),lineTotal=lineNet+lineTax;
    const lineCost=unitCost===null?null:round(quantity*unitCost,1000000n);
    gross+=lineGross;discount+=lineDiscount;net+=lineNet;tax+=lineTax;total+=lineTotal;
    if(lineCost===null)allCosts=false;else cost+=lineCost;
    return {id:String(item.id),gross:amount(lineGross),discount:amount(lineDiscount),net:amount(lineNet),tax:amount(lineTax),total:amount(lineTotal),cost:lineCost===null?null:amount(lineCost)};
  });
  const budgetRaw=decimal(draft?.budget,'Presupuesto',true),budget=budgetRaw===null?null:round(budgetRaw,100n);
  return {items:lines,gross:amount(gross),discount:amount(discount),net:amount(net),tax:amount(tax),total:amount(total),cost:allCosts?amount(cost):null,margin:allCosts?amount(net-cost):null,budgetDifference:budget===null?null:amount(budget-total)};
}

function formatOfferCsv(draft, language='es', process=null) {
  const en=language==='en',result=calculateOffer(draft);
  const cell=value=>`"${String(value ?? '').replace(/"/g,'""')}"`;
  const safe=value=>/^\s*[=+\-@\t\r]/.test(String(value||''))?`'${value}`:value;
  const number=value=>String(value ?? '').trim().replace(',','.');
  const row=values=>values.map(cell).join(',');
  const labels=en?['Description','Quantity','Unit cost','Unit price','Discount %','Gross','Discount','Rate %','Net','Tax or surcharge','Total']:
    ['Descripción','Cantidad','Costo unitario','Precio unitario','Descuento %','Bruto','Descuento','Porcentaje %','Base','Impuesto o recargo','Total'];
  const rows=[];
  if(process){
    for(const [label,value] of [[en?'Tender ID':'ID de licitación',process.id],[en?'Reference':'Referencia',process.reference],[en?'Entity':'Entidad',process.entity],[en?'Process':'Proceso',process.title]])if(value)rows.push(row([label,safe(value)]));
    rows.push('');
  }
  rows.push(row([en?'Currency / unit':'Moneda / unidad',safe(draft.currency || '')]),'',row(labels));
  for(let i=0;i<draft.items.length;i++){
    const item=draft.items[i],line=result.items[i];
    rows.push(row([safe(item.name),number(item.quantity),number(item.cost),number(item.price),number(item.discount),line.gross,line.discount,number(item.rate),line.net,line.tax,line.total]));
  }
  rows.push('',row([en?'Gross':'Bruto',result.gross]),row([en?'Discount':'Descuento',result.discount]),row([en?'Net':'Base',result.net]),row([en?'Tax or surcharge':'Impuesto o recargo',result.tax]),row([en?'Total':'Total',result.total]),row([en?'Cost':'Costo',result.cost]),row([en?'Margin before taxes':'Margen antes de impuestos',result.margin]),row([en?'Budget':'Presupuesto',number(draft.budget)]),row([en?'Budget less total':'Presupuesto menos total',result.budgetDifference]));
  rows.push(row([en?'Gross, discount and surcharge are each rounded half up to two decimal places per line. Verify rates and tender rules.':'El bruto, el descuento y el recargo se redondean cada uno a dos decimales por línea. Verifica los porcentajes y las reglas del pliego.']));
  return `\ufeff${rows.join('\r\n')}\r\n`;
}

function createEconomicOfferService({db}) {
  function result(draft,updatedAt) {try{return {draft,calculation:calculateOffer(draft),error:'',updatedAt};}catch(error){return {draft,calculation:null,error:String(error.message||error),updatedAt};}}
  function get(processId) {const row=db.prepare('SELECT draft_json,updated_at FROM economic_offer_drafts WHERE process_id=?').get(processId);if(!row)return null;return result(JSON.parse(row.draft_json),row.updated_at);}
  function save(processId,draft) {const updatedAt=new Date().toISOString();db.prepare('INSERT INTO economic_offer_drafts VALUES (?,?,?) ON CONFLICT(process_id) DO UPDATE SET draft_json=excluded.draft_json,updated_at=excluded.updated_at').run(processId,JSON.stringify(draft),updatedAt);return result(draft,updatedAt);}
  function remove(processId) {return db.prepare('DELETE FROM economic_offer_drafts WHERE process_id=?').run(processId).changes>0;}
  return {get,save,remove};
}

module.exports={createEconomicOfferSchema,createEconomicOfferService,calculateOffer,formatOfferCsv};
