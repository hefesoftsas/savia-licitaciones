import {useEffect,useState} from 'react';
import {Building2,ShieldCheck,SlidersHorizontal,UserCheck,Users} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/shared/ui/primitives/tabs';
import WebTenantAdmin,{type Tenant} from './WebTenantAdmin';
import WebAdminUsers,{type AdminUser} from './WebAdminUsers';
import WebRunnerConfig,{type RunnerConfigItem} from './WebRunnerConfig';
import {request} from './api.mjs';

type Language='es'|'en';

export default function WebAdmin({language,currentUserId,onTenantUpdated}:{language:Language;currentUserId:string;onTenantUpdated?:()=>void}){
  const en=language==='en';
  const [tab,setTab]=useState('tenants');
  const [userFilter,setUserFilter]=useState<'all'|'active'|'superadmin'>('all');
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [users,setUsers]=useState<AdminUser[]>([]);
  const [runnerItems,setRunnerItems]=useState<RunnerConfigItem[]>([]);
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    let live=true;
    void Promise.all([
      request<{tenants:Tenant[]}>('/api/admin/tenants').catch(()=>({tenants:[] as Tenant[]})),
      request<{users:AdminUser[]}>('/api/admin/users').catch(()=>({users:[] as AdminUser[]})),
      request<{items:RunnerConfigItem[]}>('/api/admin/runner-config').catch(()=>({items:[] as RunnerConfigItem[]})),
    ]).then(([tData,uData,rData])=>{
      if(!live)return;
      setTenants(tData.tenants);
      setUsers(uData.users);
      setRunnerItems(Array.isArray(rData.items)?rData.items:[]);
    });
    return()=>{live=false;};
  },[revision]);

  const activeUsers=users.filter(user=>!user.banned).length;
  const superadmins=users.filter(user=>(user.role||'').split(',').map(r=>r.trim()).includes('superadmin')).length;
  const customizedRunnerItems=runnerItems.filter(item=>item.isCustomized||!item.isBuiltIn).length;

  return <section className="web-resources web-company-workspace web-admin-workspace">
    <div className="web-resources-intro">
      <p>{en?'Create organizations (tenants), assign users to each workspace, and manage access permissions and superadministrator roles.':'Crea organizaciones (tenants), asigna usuarios a cada espacio de trabajo y administra permisos de acceso y roles de superadministrador.'}</p>
    </div>

    <div className="web-agenda-stats" role="region" aria-label={en?'Administration summary':'Resumen de administración'}>
      <button type="button" className={`web-agenda-stat-card${tab==='tenants'?' is-active':''}`} onClick={()=>setTab('tenants')}>
        <span className="web-agenda-stat-label"><Building2 size={14}/> {en?'Organizations':'Organizaciones'}</span>
        <strong className="web-agenda-stat-value">{tenants.length}</strong>
        <small>{en?'Isolated workspaces':'Espacios aislados'}</small>
      </button>
      <button type="button" className={`web-agenda-stat-card${tab==='users'&&userFilter==='all'?' is-active':''}`} onClick={()=>{setTab('users');setUserFilter('all');}}>
        <span className="web-agenda-stat-label"><Users size={14}/> {en?'Total users':'Usuarios totales'}</span>
        <strong className="web-agenda-stat-value">{users.length}</strong>
        <small>{en?'Registered accounts':'Cuentas registradas'}</small>
      </button>
      <button type="button" className={`web-agenda-stat-card${tab==='users'&&userFilter==='active'?' is-active':''}`} onClick={()=>{setTab('users');setUserFilter('active');}}>
        <span className="web-agenda-stat-label"><UserCheck size={14}/> {en?'Active access':'Acceso activo'}</span>
        <strong className="web-agenda-stat-value">{activeUsers}</strong>
        <small>{en?'Enabled users':'Usuarios habilitados'}</small>
      </button>
      <button type="button" className={`web-agenda-stat-card${tab==='users'&&userFilter==='superadmin'?' is-active':''}`} onClick={()=>{setTab('users');setUserFilter('superadmin');}}>
        <span className="web-agenda-stat-label"><ShieldCheck size={14}/> {en?'Superadministrators':'Superadministradores'}</span>
        <strong className="web-agenda-stat-value">{superadmins}</strong>
        <small>{en?'Global management':'Gestión global'}</small>
      </button>
      <button type="button" className={`web-agenda-stat-card${tab==='runner-config'?' is-active':''}`} onClick={()=>setTab('runner-config')}>
        <span className="web-agenda-stat-label"><SlidersHorizontal size={14}/> {en?'Skills, Hooks & Prompts':'Skills, Hooks y Prompts'}</span>
        <strong className="web-agenda-stat-value">{runnerItems.length}</strong>
        <small>{en?`${customizedRunnerItems} customized`:`${customizedRunnerItems} personalizados`}</small>
      </button>
    </div>

    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="web-resources-tabs" aria-label={en?'Administration sections':'Secciones de administración'}>
        <TabsTrigger value="tenants" data-admin-tab="tenants">{en?'Organizations & memberships':'Organizaciones y membresías'}</TabsTrigger>
        <TabsTrigger value="users" data-admin-tab="users">{en?'Users, roles & assignment':'Usuarios, roles y asignación'}</TabsTrigger>
        <TabsTrigger value="runner-config" data-admin-tab="runner-config">{en?'Skills, Hooks & Prompts':'Skills, Hooks y Prompts'}</TabsTrigger>
      </TabsList>
      <TabsContent value="tenants">
        <WebTenantAdmin key={`tenants-${revision}`} language={language} defaultOpen onChanged={()=>{setRevision(v=>v+1);onTenantUpdated?.();}} />
      </TabsContent>
      <TabsContent value="users">
        <WebAdminUsers key={`users-${revision}`} language={language} currentUserId={currentUserId} defaultOpen userFilter={userFilter} onUserFilterChange={setUserFilter} onChanged={()=>setRevision(v=>v+1)} />
      </TabsContent>
      <TabsContent value="runner-config">
        <WebRunnerConfig key={`runner-config-${revision}`} language={language} onChanged={()=>setRevision(v=>v+1)} />
      </TabsContent>
    </Tabs>
  </section>;
}
