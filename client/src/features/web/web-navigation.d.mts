export const views: string[];
export const projectTabs: string[];
export const preparationSteps: string[];
export function readNavigation(search:string):{view:string;project:string;tab:string;step:number|null;opportunity:string};
export function navigationSearch(route:{view:string;project:string;tab:string;step:number|null;opportunity:string}):string;
