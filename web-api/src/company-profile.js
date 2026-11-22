const fields = ['companyName','unifiedSocialCreditCode','phone','email','legalRepresentative','registeredCapital','operatingPeriodStart','operatingPeriodEnd','address','businessScope','industry','companyType','insuredEmployeeCount','companyIntro','taxCertificateDate','taxCertificateNote','auditReportDate','auditReportNote','socialSecurityCertificateDate','socialSecurityCertificateNote','bankAccountName','bankAccountNumber','bankName','bankRoutingNumber','watermarkContent'];
const empty = () => ({ ...Object.fromEntries(fields.map(field => [field, ''])), watermarkEnabled: false });
const bad = () => Response.json({error:'invalid_profile'},{status:400});
export function normalizeCompanyProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const hasBenchmarks = Object.hasOwn(profile, 'bidBenchmarks');
  if (hasBenchmarks && (typeof profile.bidBenchmarks !== 'string' || profile.bidBenchmarks.length > 4000)) return null;
  if (Object.keys(profile).length !== fields.length + 1 + Number(hasBenchmarks) ||
      fields.some(field => typeof profile[field] !== 'string' || profile[field].length > 100000) ||
      typeof profile.watermarkEnabled !== 'boolean' || JSON.stringify(profile).length > 512000) return null;
  return {
    ...Object.fromEntries(fields.map(field => [field, profile[field]])),
    watermarkEnabled: profile.watermarkEnabled,
    ...(hasBenchmarks ? {bidBenchmarks: profile.bidBenchmarks} : {}),
  };
}
export async function companyProfile(request, env, owner) {
 if(request.method==='GET'){
  const row=await env.DB.prepare('SELECT profile_json,version,updated_at FROM company_profiles WHERE owner_id=?').bind(owner).first();
  return Response.json(row?{profile:JSON.parse(row.profile_json),version:row.version,updatedAt:row.updated_at}:{profile:empty(),version:0,updatedAt:null});
 }
 if(request.method!=='PUT')return new Response('Method not allowed',{status:405});
 if(request.headers.get('origin')!==new URL(env.BETTER_AUTH_URL).origin)return Response.json({error:'invalid_origin'},{status:403});
 let input;try{input=await request.json();}catch{return bad();}
 const normalized=normalizeCompanyProfile(input?.profile);
 if(!Number.isSafeInteger(input?.version)||input.version<0||!normalized)return bad();
 const json=JSON.stringify(normalized),now=new Date().toISOString();
 const row=input.version===0
  ?await env.DB.prepare('INSERT INTO company_profiles(owner_id,profile_json,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(owner_id) DO NOTHING RETURNING version,updated_at').bind(owner,json,now).first()
  :await env.DB.prepare(`UPDATE company_profiles SET profile_json=json_patch(profile_json,?),version=version+1,updated_at=? WHERE owner_id=? AND version=? RETURNING version,updated_at,profile_json`).bind(json,now,owner,input.version).first();
 return row?Response.json({profile:row.profile_json?JSON.parse(row.profile_json):normalized,version:row.version,updatedAt:row.updated_at}):Response.json({error:'version_conflict'},{status:409});
}
