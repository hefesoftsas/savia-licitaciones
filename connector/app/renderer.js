const $ = id => document.getElementById(id);
const form = $('pair-form');
let state = {};
let language = 'es';
let editing = false;
let errorCode = null;
let initialized = false;
const copy = {
  es: {
    connector: 'Conector', language: 'Idioma', setupTitle: 'Conecta este equipo',
    setupDescription: 'Copia la dirección y el código que aparecen en Savia web. Solo tienes que hacerlo una vez.',
    address: 'Dirección de Savia', deviceName: 'Nombre del equipo', connectionCode: 'Código de conexión',
    codePlaceholder: 'Pega aquí el código', codeHint: 'En Savia web, abre Runners y genera tu código.',
    connect: 'Conectar equipo', cancel: 'Cancelar', start: 'Iniciar conector', stop: 'Detener conector',
    openWeb: 'Volver a Savia web', openDownloads: 'Ver descargas del conector', reconnect: 'Conectar con otra cuenta', footer: 'Mantén esta aplicación abierta mientras Savia trabaja.', updateHint: 'Para actualizar, termina las tareas, detén el conector e instala la nueva versión.',
    runningTitle: 'Conector en marcha', pairedTitle: 'Equipo conectado',
    runningDescription: 'El conector está abierto en este equipo. Comprueba su conexión y las tareas en Savia web.',
    pairedDescription: 'Inicia el conector para recibir tareas de Savia.', externalDescription: 'El runner está activo fuera de esta ventana. Adminístralo desde el proceso que lo inició.', waiting: 'Un momento…',
    errors: {
      invalid_address: 'Revisa la dirección de Savia. Debe comenzar con https://.',
      invalid_code: 'El código no es válido. Copia uno nuevo desde Savia web.',
      invalid_name: 'Escribe un nombre para este equipo.', busy: 'Espera a que termine la operación actual.',
      not_paired: 'Conecta primero este equipo.', pair_timeout: 'La conexión tardó demasiado. Comprueba internet y vuelve a intentarlo.',
      connection_failed: 'No se pudo conectar. Revisa la dirección y genera un código nuevo en Savia web.',
      configuration_unavailable: 'No se pudo leer la conexión guardada. Vuelve a conectar el equipo.',
      start_failed: 'No se pudo iniciar. Cierra y vuelve a abrir Savia Conector.',
      runner_stopped: 'El conector se detuvo. Puedes volver a iniciarlo.',
      operation_failed: 'No se pudo completar la acción. Inténtalo de nuevo.',
      shutting_down: 'El conector se está cerrando.',
      operation_cancelled: 'La conexión se canceló.',
      stop_failed: 'No se pudo detener el conector. Inténtalo de nuevo.'
    }
  },
  en: {
    connector: 'Connector', language: 'Language', setupTitle: 'Connect this computer',
    setupDescription: 'Copy the address and code shown in Savia web. You only need to do this once.',
    address: 'Savia address', deviceName: 'Computer name', connectionCode: 'Connection code',
    codePlaceholder: 'Paste your code here', codeHint: 'In Savia web, open Runners and generate your code.',
    connect: 'Connect computer', cancel: 'Cancel', start: 'Start connector', stop: 'Stop connector',
    openWeb: 'Open Savia web', openDownloads: 'View connector downloads', reconnect: 'Connect another account', footer: 'Keep this application open while Savia is working.', updateHint: 'To update, finish your tasks, stop the connector and install the new version.',
    runningTitle: 'Connector running', pairedTitle: 'Computer connected',
    runningDescription: 'The connector is open on this computer. Check its connection and tasks in Savia web.',
    pairedDescription: 'Start the connector to receive tasks from Savia.', externalDescription: 'The runner is active outside this window. Manage it from the process that started it.', waiting: 'One moment…',
    errors: {
      invalid_address: 'Check your Savia address. It must start with https://.',
      invalid_code: 'This code is not valid. Copy a new one from Savia web.',
      invalid_name: 'Enter a name for this computer.', busy: 'Wait for the current operation to finish.',
      not_paired: 'Connect this computer first.', pair_timeout: 'The connection took too long. Check your internet connection and try again.',
      connection_failed: 'Could not connect. Check the address and generate a new code in Savia web.',
      configuration_unavailable: 'Could not read your saved connection. Connect this computer again.',
      start_failed: 'Could not start. Close and reopen Savia Connector.',
      runner_stopped: 'The connector stopped. You can start it again.',
      operation_failed: 'Could not complete this action. Please try again.',
      shutting_down: 'The connector is closing.',
      operation_cancelled: 'The connection was cancelled.',
      stop_failed: 'Could not stop the connector. Please try again.'
    }
  }
};
function showError(code) {
  errorCode = code;
  $('error').hidden = !code;
  $('error').textContent = code ? copy[language].errors[code] || copy[language].errors.operation_failed : '';
}
function paint() {
  document.querySelector('main').classList.toggle('connected-layout',!!state.paired&&!editing);
  $('activity-panel').hidden=!state.paired||editing;
  const log=$('activity-log'),follow=log.scrollTop+log.clientHeight>=log.scrollHeight-30,previous=log.scrollTop;
  $('activity-title').textContent=language==='en'?'Agent console · this session':'Consola del agente · esta sesión';
  $('activity-empty').hidden=!!state.activity?.length;
  $('activity-empty').textContent=language==='en'?'No activity yet.':'Aún no hay actividad.';
  $('activity-events').replaceChildren(...(state.activity||[]).map(event=>{
    const li=document.createElement('li'),time=document.createElement('time'),content=document.createElement('div');
    time.textContent=new Date(event.at).toLocaleTimeString(language==='en'?'en-US':'es-CO');
    const names=language==='en'?{preparing:'Preparing',reading:'Reading sources',generating:'Working with model',ocr:'Recognizing text','document.start':'Opening document','document.end':'Document read','chapter.start':'Drafting chapter','chapter.end':'Chapter saved','ocr.page':'Reading scanned page','job.succeeded':'Task completed','job.failed':'Task failed'}:{preparing:'Preparando',reading:'Consultando fuentes',generating:'Trabajando con el modelo',ocr:'Reconociendo texto','document.start':'Abriendo documento','document.end':'Documento leído','chapter.start':'Redactando capítulo','chapter.end':'Capítulo guardado','ocr.page':'Leyendo página escaneada','job.succeeded':'Tarea completada','job.failed':'Tarea fallida'};
    const parts=event.code.split('.'),tools=language==='en'?{read:'Read file',write:'Write file',edit:'Edit file',find:'Find files',grep:'Search text',ls:'List files'}:{read:'Leer archivo',write:'Escribir archivo',edit:'Editar archivo',find:'Buscar archivos',grep:'Buscar texto',ls:'Listar archivos'};
    const label=event.code==='agent.console'?`${event.details?.event||'agente'} ${event.details?.tool||''}`:names[event.code]||(parts[0]==='tool'?`${tools[parts[1]]||parts[1]} · ${language==='en'?parts[2]:({start:'inicio',end:'fin',error:'error'}[parts[2]]||parts[2])}`:event.code);
    const d=event.details||{};content.textContent=[label,d.chapter,d.document,d.path,d.page?`${d.page}/${d.totalPages}`:null,d.index?`${d.index}/${d.total}`:null].filter(Boolean).join(' · ');
    if(d.text){const pre=document.createElement('pre');let output=d.text;try{const v=JSON.parse(d.text);output=typeof v.text==='string'&&/^(assistant\.|process\.)/.test(v.event||'')?v.text:JSON.stringify(v.args??v.result??v,null,2);}catch{}pre.textContent=output;content.append(pre);}
    li.dataset.kind=d.event||event.code;
    li.title=event.jobId;li.append(time,content);return li;
  }));
  log.scrollTop=follow?log.scrollHeight:previous;
  const text = copy[language];
  document.documentElement.lang = language;
  document.title = `Savia ${text.connector}`;
  document.querySelectorAll('[data-copy]').forEach(element => { element.textContent = text[element.dataset.copy]; });
  form.elements.code.placeholder = text.codePlaceholder;
  $('setup').hidden = state.paired && !editing;
  $('connected').hidden = !state.paired || editing;
  $('cancel-pair').hidden = !state.paired;
  $('server').textContent = state.server || '';
  $('state-title').textContent = state.running ? text.runningTitle : text.pairedTitle;
  $('state-description').textContent = state.external ? text.externalDescription : state.running ? text.runningDescription : text.pairedDescription;
  $('status-icon').textContent = state.running ? '✓' : 'Ⅱ';
  $('status-icon').classList.toggle('stopped', !state.running);
  $('start').hidden = !!state.running;
  $('stop').hidden = !state.running || !!state.external;
  $('reconnect').hidden = !!state.running;
  $('open-downloads').hidden = !state.paired;
  for (const element of document.querySelectorAll('button, input')) element.disabled = !!state.busy;
  form.setAttribute('aria-busy', String(!!state.busy));
  $('notice').textContent = state.busy ? text.waiting : '';
  showError(errorCode);
}
function render(next) {
  state = next;
  if (!initialized) {
    form.elements.name.value = next.name || '';
    form.elements.server.value = next.server || '';
    initialized = true;
  }
  if (next.running) editing = false;
  errorCode = next.error;
  paint();
}
async function act(call) {
  try {
    const result = await call();
    if (!result.ok) { showError(result.error); return; }
    if (result.value && typeof result.value === 'object') render(result.value);
  } catch { showError('operation_failed'); }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(form);
  void act(() => window.connector.pair({ server: String(data.get('server')).trim(), name: String(data.get('name')), code: String(data.get('code')).trim() }));
  form.elements.code.value = '';
});
$('start').onclick = () => act(() => window.connector.start());
$('stop').onclick = () => act(() => window.connector.stop());
$('open-web').onclick = () => act(() => window.connector.openWeb());
$('open-downloads').onclick = () => act(() => window.connector.openDownloads());
$('reconnect').onclick = () => { editing = true; showError(null); paint(); form.elements.server.focus(); };
$('cancel-pair').onclick = () => { editing = false; form.elements.code.value = ''; showError(null); paint(); $('start').focus(); };
$('language').onchange = event => { language = event.target.value === 'en' ? 'en' : 'es'; paint(); };
const unsubscribe = window.connector.onStatus(render);
window.addEventListener('unload', () => unsubscribe?.());
void act(() => window.connector.status());
void window.connector.version().then(result => { if (result.ok) $('version').textContent = `· ${result.value}`; }).catch(() => {});
