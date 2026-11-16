'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildPreflightChecklist}=require('../src/preflight-checklist.cjs');

test('identifica pendientes sin declarar la oferta lista',()=>{
 const result=buildPreflightChecklist({tender:{process:{deadline:'2026-11-20',deadlineVerified:true}},requirements:[{id:'r1',title:'Experiencia',status:'pending'}],supports:[{requirementId:'r1',title:'Certificado',status:'missing',certificateId:''}],certificates:[],offer:null,tasks:[{title:'Revisar anexos',completed:false,dueDate:'2026-11-18'}]});
 assert.ok(result.items.some(item=>item.code==='requirement_pending'&&item.target==='requirements'));
 assert.ok(result.items.some(item=>item.code==='support_missing'&&item.target==='requirements'));
 assert.ok(result.items.some(item=>item.code==='offer_missing'&&item.target==='economic-offer'));
 assert.ok(result.items.some(item=>item.code==='task_pending'&&item.target==='tasks'));
 assert.equal(Object.hasOwn(result,'ready'),false);
});

test('compara fechas conocidas con el cierre y deja lo desconocido para revisión',()=>{
 const base={requirements:[{id:'r',title:'Capacidad',status:'meets'}],supports:[{requirementId:'r',title:'Cámara',status:'reviewed',certificateId:'c'},{requirementId:'r',title:'RUP',status:'reviewed',certificateId:'rup:x'}],certificates:[{certificateId:'c',name:'Cámara',validityMode:'range',validTo:'2026-11-19'}],offer:{draft:{items:[{name:'Servicio'}]},calculation:{total:'100.00'},error:''},tasks:[]};
 const verified=buildPreflightChecklist({...base,tender:{process:{deadline:'2026-11-20',deadlineVerified:true}}});
 assert.ok(verified.items.some(item=>item.code==='support_expires_before_deadline'&&item.title==='Cámara'));
 assert.ok(verified.items.some(item=>item.code==='support_validity_unknown'&&item.title==='RUP'));
 const unverified=buildPreflightChecklist({...base,tender:{process:{deadline:'2026-11-20',deadlineVerified:false}}});
 assert.ok(unverified.items.some(item=>item.code==='deadline_unverified'));
 assert.equal(unverified.items.some(item=>item.code==='support_expires_before_deadline'),false);
});

test('advierte si la credencial vinculada ya no está disponible',()=>{
 const result=buildPreflightChecklist({tender:{process:{}},requirements:[{id:'r',title:'R',status:'pending'}],supports:[{requirementId:'r',title:'Soporte',status:'reviewed',certificateId:'old',certificateAvailable:false}]});
 assert.ok(result.items.some(item=>item.code==='support_unavailable'&&item.title==='Soporte'));
});

test('no presenta como vigentes fechas de certificado inconsistentes',()=>{
 const result=buildPreflightChecklist({tender:{process:{deadline:'2026-11-20',deadlineVerified:true}},requirements:[{id:'r',title:'R',status:'meets'}],supports:[{requirementId:'r',title:'Certificado',status:'reviewed',certificateId:'c'}],certificates:[{certificateId:'c',validityMode:'range',validFrom:'2026-12-01',validTo:'2026-11-01'}]});
 assert.ok(result.items.some(item=>item.code==='support_validity_unknown'));
 assert.equal(result.items.some(item=>item.code==='support_expires_before_deadline'),false);
});
