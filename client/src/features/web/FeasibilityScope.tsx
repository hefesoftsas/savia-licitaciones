import {createContext,useCallback,useContext,type ReactNode} from 'react';
import {request as apiRequest} from './api.mjs';
import {feasibilityUrl} from './feasibility-api.mjs';

const Scope = createContext<string | null>(null);
export function FeasibilityScope({projectId,children}:{projectId?:string;children:ReactNode}){
 return <Scope.Provider value={projectId||null}>{children}</Scope.Provider>;
}
export function useFeasibilityPath(){
 const projectId=useContext(Scope);
 return useCallback((url:string)=>projectId&&(url==='/api/feasibility-report'||url.startsWith('/api/feasibility-report/')||url.startsWith('/api/feasibility-report?'))?feasibilityUrl(projectId,url):url,[projectId]);
}
export function useFeasibilityRequest():typeof apiRequest {
 const path=useFeasibilityPath();
 return useCallback(<T,>(url:string,options?:RequestInit & {json?:unknown},fetcher?:typeof fetch)=>apiRequest<T>(path(url),options,fetcher),[path]);
}
