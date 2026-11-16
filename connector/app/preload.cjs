const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('connector',{
 status:()=>ipcRenderer.invoke('connector:status'),pair:input=>ipcRenderer.invoke('connector:pair',input),start:()=>ipcRenderer.invoke('connector:start'),stop:()=>ipcRenderer.invoke('connector:stop'),openWeb:()=>ipcRenderer.invoke('connector:open-web'),
 version:()=>ipcRenderer.invoke('connector:version'),openDownloads:()=>ipcRenderer.invoke('connector:open-downloads'),
 onStatus:callback=>{const listener=(_event,value)=>callback(value);ipcRenderer.on('connector:status',listener);return()=>ipcRenderer.removeListener('connector:status',listener);},
});
