type OutlineNode={id:string;title:string;description?:string;content?:string;children?:OutlineNode[];[key:string]:unknown};
type Operation={type:'add-root';node:OutlineNode}|{type:'add-child';id:string;node:OutlineNode}|{type:'edit';id:string;patch:Partial<OutlineNode>}|{type:'delete';id:string}|{type:'move';id:string;delta:-1|1};
export function editOutline(nodes:OutlineNode[],operation:Operation):OutlineNode[];
export function prepareOutlineSave(before:OutlineNode[],after:OutlineNode[]):{kind:''|'sort'|'edit';nodes:OutlineNode[]};
