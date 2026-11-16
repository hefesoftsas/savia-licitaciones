const defaults=['summary','calendar','events'];
function valid(order){return Array.isArray(order)&&order.length===defaults.length&&new Set(order).size===defaults.length&&order.every(id=>defaults.includes(id));}
export async function agendaLayout(request,env,userId){
 if(request.method==='GET'){const row=await env.DB.prepare('SELECT layout_json FROM agenda_layout_preferences WHERE owner_id=?').bind(userId).first();let order;try{order=row?JSON.parse(row.layout_json):defaults;}catch{order=defaults;}return Response.json({order:valid(order)?order:defaults});}
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return Response.json({error:'invalid_json'},{status:400});}
 if(!valid(input?.order))return Response.json({error:'invalid_layout'},{status:400});
 await env.DB.prepare('INSERT INTO agenda_layout_preferences(owner_id,layout_json) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET layout_json=excluded.layout_json').bind(userId,JSON.stringify(input.order)).run();return Response.json({order:input.order});
}
