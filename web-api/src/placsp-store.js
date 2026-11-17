export async function upsertPlacspEntries(env, entries, now = Date.now()) {
  if (!Array.isArray(entries) || entries.length === 0) return;
  for (let i = 0; i < entries.length; i += 40) {
    const chunk = entries.slice(i, i + 40);
    await env.DB.batch(chunk.map(item =>
      env.DB.prepare(`INSERT INTO placsp_tenders (id, reference, title, entity, entity_id, modality, status, status_code, value, currency, publication_date, deadline, territory, city, classification_code, cpv_codes_json, url, documents_json, updated_at, synced_at, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET reference=excluded.reference, title=excluded.title, entity=excluded.entity, entity_id=excluded.entity_id, modality=excluded.modality, status=excluded.status, status_code=excluded.status_code, value=excluded.value, currency=excluded.currency, publication_date=excluded.publication_date, deadline=excluded.deadline, territory=excluded.territory, city=excluded.city, classification_code=excluded.classification_code, cpv_codes_json=excluded.cpv_codes_json, url=excluded.url, documents_json=CASE WHEN (excluded.id LIKE 'pscp:%' OR excluded.id LIKE 'licit:%') AND excluded.documents_json = '[]' THEN placsp_tenders.documents_json ELSE excluded.documents_json END, updated_at=excluded.updated_at, synced_at=excluded.synced_at, description=excluded.description
        WHERE COALESCE(julianday(excluded.updated_at), 0) >= COALESCE(julianday(placsp_tenders.updated_at), 0)`)
        .bind(item.id, item.reference || '', item.title, item.entity || '', item.entityId || '', item.modality || '', item.status || '', item.statusCode || '', item.value ?? null, item.currency || 'EUR', item.publicationDate || '', item.deadline || '', item.territory || '', item.city || '', item.classificationCode || '', JSON.stringify(item.cpvCodes || []), item.url || '', JSON.stringify(item.documents || []), item.updatedAt || '', now, item.description || '')
    ));
  }
}

