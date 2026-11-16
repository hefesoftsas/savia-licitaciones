export type NavigationGroup={id:string;name:string;items:string[]};
export const navigationIds:string[];
export function defaultNavigation():NavigationGroup[];
export function validNavigation(value:unknown):boolean;
export function moveNavigationItem(groups:NavigationGroup[],item:string,target:string,before?:string):NavigationGroup[];
export function matchesNavigation(label:string,query:string):boolean;

export function migrateNavigation(groups:NavigationGroup[]):NavigationGroup[];
