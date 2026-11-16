export type TenderRuleSuggestion={sourceId:string;sourceName:string;line:number;quote:string;operator:'gte'|'lte';threshold:string};
export function parseTenderRule(quote:string):{operator:'gte'|'lte';threshold:string}|null;
export function findTenderRules(documents:Array<{id:string;name:string;text:string}>):TenderRuleSuggestion[];
