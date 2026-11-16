import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

// OpenCode keeps credentials and the last selected model on the user's machine.
// The caller must never send the returned secret to Savia's web service.
export async function readLocalOpenCodeConfig({dataHome=process.env.XDG_DATA_HOME||join(homedir(),'.local','share'),stateHome=process.env.XDG_STATE_HOME||join(homedir(),'.local','state')}={}) {
 try {
  const [auth,state]=await Promise.all([
   readFile(join(dataHome,'opencode','auth.json'),'utf8').then(JSON.parse),
   readFile(join(stateHome,'opencode','model.json'),'utf8').then(JSON.parse),
  ]);
  const selected=state.recent?.[0],key=auth['opencode-go'];
  if(selected?.providerID!=='opencode-go'||typeof selected.modelID!=='string'||!selected.modelID.trim()||key?.type!=='api'||typeof key.key!=='string'||!key.key.trim())return null;
  return {provider:'opencode-go',model:selected.modelID,secret:key.key};
 } catch { return null; }
}
