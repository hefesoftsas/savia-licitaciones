// Worker-compatible structural checks; the runner additionally uses its Markdown
// parser to compare resolved links and images before transmitting a proposal.
export function technicalWordProtectedMarkup(text){
 const value=String(text),tags=value.match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g)||[],references=value.match(/^\s{0,3}\[[^\]]+\]:\s*\S+.*$/gm)||[],inlineCode=value.match(/(`+)[^`\n]+\1/g)||[],blocks=[];let fence=null,lines=[];
 for(const line of value.split('\n')){const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];if(!fence){if(marker){fence=marker;lines=[line];}}else{lines.push(line);if(marker&&marker[0]===fence[0]&&marker.length>=fence.length){blocks.push(lines.join('\n'));fence=null;lines=[];}}}
 if(fence)blocks.push(lines.join('\n'));return JSON.stringify({tags,references,inlineCode,blocks});
}
