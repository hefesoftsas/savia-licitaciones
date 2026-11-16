// SQL representation of all records used by suggestionSources; usable inside a single atomic mutation.
export const opportunitySourceState = (owner,includeRup) => `json_object(
 'profile',COALESCE((SELECT profile_json FROM company_profiles WHERE owner_id=${owner}),''),
 'experience',COALESCE((SELECT json_group_array(details_json) FROM (SELECT details_json FROM company_experience_projects WHERE owner_id=${owner} AND deleting=0 ORDER BY updated_at DESC,created_at DESC,id LIMIT 12)),'[]'),
 'rup',CASE WHEN ${includeRup}=1 THEN COALESCE((SELECT json_group_array(json_array(label,value,page)) FROM (SELECT f.label,f.value,f.page FROM rup_current c JOIN rup_reviewed_facts f ON f.certificate_id=c.certificate_id WHERE c.owner_id=${owner} ORDER BY f.created_at,f.id)),'[]') ELSE '[]' END
)`;
