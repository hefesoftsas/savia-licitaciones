function apply(nodes,op){
 if(op.type==='add-root')return [...nodes,op.node];
 return nodes.flatMap((node,index)=>{
  if(node.id===op.id&&op.type==='delete')return [];
  if(node.id===op.id&&op.type==='edit')return [{...node,...op.patch}];
  if(node.id===op.id&&op.type==='add-child')return [{...node,children:[...(node.children||[]),op.node]}];
  if(op.type==='move'&&node.id===op.id){const target=index+op.delta;if(target>=0&&target<nodes.length)return [];}
  if(op.type==='move'&&index===nodes.findIndex(item=>item.id===op.id)+op.delta&&nodes.some(item=>item.id===op.id)){const origin=nodes.find(item=>item.id===op.id);return op.delta<0?[origin,node]:[node,origin];}
  return [node.children?{...node,children:apply(node.children,op)}:node];
 });
}
export function editOutline(nodes,operation){return apply(nodes,operation);}
function flatten(nodes,parent=null,result=new Map()){
 for(const node of nodes){if(result.has(node.id))throw new Error('Duplicate outline id');result.set(node.id,{node,parent,children:(node.children||[]).map(child=>child.id)});flatten(node.children||[],node.id,result);}return result;
}
export function prepareOutlineSave(before,after){
 const old=flatten(before),next=flatten(after),clear=new Set();let structure=false,sort=false;
 for(const [id,item] of next){const prior=old.get(id);if(!prior){structure=true;if(item.parent&&old.has(item.parent))clear.add(item.parent);continue;}if(prior.parent!==item.parent){structure=true;clear.add(id);}if(prior.node.title!==item.node.title||(prior.node.description||'')!==(item.node.description||'')){structure=true;clear.add(id);}if(JSON.stringify(prior.children)!==JSON.stringify(item.children))sort=true;}
 for(const id of old.keys())if(!next.has(id))structure=true;
 if(JSON.stringify(before.map(node=>node.id))!==JSON.stringify(after.map(node=>node.id)))sort=true;
 const mark=nodes=>nodes.map(node=>({...node,...(clear.has(node.id)?{content:''}:{}),...(node.children?{children:mark(node.children)}:{})}));
 return {kind:structure?'edit':sort?'sort':'',nodes:mark(after)};
}
