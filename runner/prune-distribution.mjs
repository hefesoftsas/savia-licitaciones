import {readFile,readdir,realpath,lstat,rm,writeFile} from 'node:fs/promises';
import {join,dirname,relative,sep} from 'node:path';

// Follow the installed graph, including optional dependencies and peers. Do not
// guess transitive versions or modify the workspace installation / frozen lock.
export async function pruneDistribution(client,roots){
 const modules=await realpath(join(client,'node_modules')),store=join(modules,'.pnpm');
 const boundary=await realpath(client),retained=new Set(),groups=new Set();
 async function visit(link,optional=false){
  let folder;try{folder=await realpath(link);}catch(error){if(optional&&error.code==='ENOENT')return;throw error;}
  if(!folder.startsWith(boundary+sep))throw new Error('Dependencia fuera de la distribución.');
  if(retained.has(folder))return;retained.add(folder);
  const pkg=JSON.parse(await readFile(join(folder,'package.json'),'utf8'));
  const rel=relative(store,folder);if(rel.startsWith('..'))throw new Error('Se requiere una distribución pnpm aislada.');
  groups.add(rel.split(sep)[0]);
  const siblingModules=pkg.name.startsWith('@')?dirname(dirname(folder)):dirname(folder);
  const required=pkg.dependencies||{},optionalDeps=pkg.optionalDependencies||{},peers=pkg.peerDependencies||{};
  for(const name of new Set([...Object.keys(required),...Object.keys(optionalDeps),...Object.keys(peers)])){
   const optional=name in optionalDeps||(!(name in required)&&pkg.peerDependenciesMeta?.[name]?.optional===true);
   await visit(join(siblingModules,name),optional);
  }
 }
 for(const name of roots)await visit(join(modules,name));
 for(const entry of await readdir(store,{withFileTypes:true}))if(entry.isDirectory()&&entry.name!=='node_modules'&&!groups.has(entry.name))await rm(join(store,entry.name),{recursive:true,force:true});
 let removedMaps=0;
 async function clean(directory){
  for(const item of await readdir(directory,{withFileTypes:true})){
   const path=join(directory,item.name);
   if(item.isSymbolicLink()){
    try{const target=await realpath(path);if(![...retained].some(folder=>target===folder||target.startsWith(folder+sep)))await rm(path,{force:true});}
    catch(error){if(error.code==='ENOENT')await rm(path,{force:true});else throw error;}
   }else if(item.isDirectory())await clean(path);
   else if(/\.(?:[cm]?js|css)\.map$/.test(item.name)){removedMaps+=(await lstat(path)).size;await rm(path);}
  }
 }
 // Prune dangling/shared/root aliases without touching runtime files or licenses.
 await clean(modules);
 const pkg=JSON.parse(await readFile(join(client,'package.json'),'utf8'));
 pkg.dependencies=Object.fromEntries(roots.map(name=>{if(!pkg.dependencies[name])throw new Error(`Raíz desconocida: ${name}`);return [name,pkg.dependencies[name]];}));
 delete pkg.devDependencies;
 await writeFile(join(client,'package.json'),JSON.stringify(pkg,null,2)+'\n','utf8');
 return {packages:retained.size,removedSourceMapBytes:removedMaps};
}
