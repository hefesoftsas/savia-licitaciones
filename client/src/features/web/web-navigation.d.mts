import type {ProjectUiMode} from './autopilot-state.mjs';
type ReviewFocus = 'duplicates'|'rejection';
type NavigationRoute = {view:string;project:string;tab:string;step:number|null;opportunity:string};
export const views: string[];
export const projectTabs: string[];
export const preparationSteps: string[];
export function readNavigation(search:string):NavigationRoute & {projectMode:ProjectUiMode|null;reviewFocus:ReviewFocus|null};
export function navigationSearch(route:NavigationRoute & {projectMode?:ProjectUiMode|null;reviewFocus?:ReviewFocus|null}):string;
