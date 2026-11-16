const idPattern=/^[A-Za-z0-9._:-]{1,128}$/;
export async function runnerProjectInventory(request,env,runner){
 if(request.method!=='GET')return new Response('Method not allowed',{status:405});
 const query=new URL(request.url).searchParams,values=query.getAll('after');
 if(values.length>1||(values.length===1&&!idPattern.test(values[0])))return Response.json({error:'invalid_cursor'},{status:400});
 const cursor=values[0]??null,sql=cursor===null?'SELECT id FROM projects WHERE owner_id=? ORDER BY id LIMIT 101':'SELECT id FROM projects WHERE owner_id=? AND id>? ORDER BY id LIMIT 101';
 const rows=(await (cursor===null?env.DB.prepare(sql).bind(runner.ownerId):env.DB.prepare(sql).bind(runner.ownerId,cursor)).all()).results;
 if(rows.some(row=>typeof row.id!=='string'||!idPattern.test(row.id)))return Response.json({error:'invalid_project_id'},{status:409});
 const projects=rows.slice(0,100);return Response.json({projects,nextCursor:rows.length>100?projects.at(-1).id:null});
}
