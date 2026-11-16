export function runnerDownloads(env,requestUrl){
 const downloads={};
 const loopback=url=>url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 let localPreview=false;try{localPreview=loopback(new URL(requestUrl));}catch{}
 for(const [platform,key] of [['windows','RUNNER_DOWNLOAD_WINDOWS_URL'],['macos','RUNNER_DOWNLOAD_MACOS_URL'],['macos-arm64','RUNNER_DOWNLOAD_MACOS_ARM64_URL'],['macos-x64','RUNNER_DOWNLOAD_MACOS_X64_URL'],['linux','RUNNER_DOWNLOAD_LINUX_URL'],['linux-x64','RUNNER_DOWNLOAD_LINUX_X64_URL'],['linux-arm64','RUNNER_DOWNLOAD_LINUX_ARM64_URL']]){try{const url=new URL(env[key]);if((url.protocol==='https:'||(localPreview&&loopback(url)))&&!url.username&&!url.password)downloads[platform]=url.href;}catch{}}
 return Response.json({downloads});
}
