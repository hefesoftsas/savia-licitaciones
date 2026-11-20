export async function upsertPlacspEntries(env, entries, now = Date.now()) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  for (let i = 0; i < entries.length; i += 40) {
    const chunk = entries.slice(i, i + 40);
    await env.DB.batch(chunk.map(item =>
      env.DB.prepare(`INSERT INTO placsp_tenders (id, reference, title, entity, entity_id, modality, status, status_code, value, currency, publication_date, deadline, territory, city, classification_code, cpv_codes_json, url, documents_json, updated_at, synced_at, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          reference=excluded.reference,
          title=excluded.title,
          entity=excluded.entity,
          entity_id=CASE WHEN excluded.id LIKE 'portal:%' AND excluded.entity_id = '' THEN placsp_tenders.entity_id ELSE excluded.entity_id END,
          modality=excluded.modality,
          status=excluded.status,
          status_code=excluded.status_code,
          value=excluded.value,
          currency=excluded.currency,
          publication_date=CASE WHEN excluded.id LIKE 'portal:%' AND excluded.publication_date = '' THEN placsp_tenders.publication_date ELSE excluded.publication_date END,
          deadline=CASE WHEN excluded.id LIKE 'portal:%' AND length(excluded.deadline) = 10 AND placsp_tenders.deadline LIKE excluded.deadline || 'T%' THEN placsp_tenders.deadline ELSE excluded.deadline END,
          territory=CASE WHEN excluded.id LIKE 'portal:%' AND excluded.territory = '' THEN placsp_tenders.territory ELSE excluded.territory END,
          city=CASE WHEN excluded.id LIKE 'portal:%' AND excluded.city = '' THEN placsp_tenders.city ELSE excluded.city END,
          classification_code=CASE WHEN excluded.id LIKE 'portal:%' AND excluded.classification_code = '' THEN placsp_tenders.classification_code ELSE excluded.classification_code END,
          cpv_codes_json=CASE WHEN excluded.id LIKE 'portal:%' AND excluded.cpv_codes_json = '[]' THEN placsp_tenders.cpv_codes_json ELSE excluded.cpv_codes_json END,
          url=excluded.url,
          documents_json=CASE WHEN (excluded.id LIKE 'pscp:%' OR excluded.id LIKE 'licit:%' OR excluded.id LIKE 'portal:%' OR excluded.id LIKE 'ted:%') AND excluded.documents_json = '[]' THEN placsp_tenders.documents_json ELSE excluded.documents_json END,
          updated_at=excluded.updated_at,
          synced_at=excluded.synced_at,
          description=CASE WHEN excluded.id LIKE 'portal:%' AND excluded.description = '' THEN placsp_tenders.description ELSE excluded.description END
        WHERE COALESCE(julianday(excluded.updated_at), 0) >= COALESCE(julianday(placsp_tenders.updated_at), 0)`)
        .bind(item.id, item.reference || '', item.title, item.entity || '', item.entityId || '', item.modality || '', item.status || '', item.statusCode || '', item.value ?? null, item.currency || 'EUR', item.publicationDate || '', item.deadline || '', item.territory || '', item.city || '', item.classificationCode || '', JSON.stringify(item.cpvCodes || []), item.url || '', JSON.stringify(item.documents || []), item.updatedAt || '', now, item.description || '')
    ));
  }
}

