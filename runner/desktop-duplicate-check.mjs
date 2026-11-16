const tables = ['duplicate_check_meta', 'duplicate_check_files', 'duplicate_check_tasks', 'duplicate_check_analysis_sections', 'duplicate_check_content_files', 'duplicate_check_metadata_items', 'duplicate_check_outline_items', 'duplicate_check_outline_groups', 'duplicate_check_outline_pairwise', 'duplicate_check_content_duplicates', 'duplicate_check_content_occurrences', 'duplicate_check_image_files', 'duplicate_check_duplicate_images', 'duplicate_check_image_occurrences'];
const limit = 25 * 1024 * 1024;
const safePart = value => typeof value === 'string' && !!value && value !== '.' && value !== '..' && !/[\\/:\x00-\x1f\x7f]/.test(value);

// Only match an exact archive key; never open a path recorded in the database.
function archiveFile(archive, key) {
 const bytes = archive.get(key);
 return !bytes ? { missing: true, reason: 'not_found' } : !bytes.length ? { missing: true, reason: 'empty' } : bytes.length > limit ? { missing: true, reason: 'too_large' } : { bytes };
}

export function readDesktopDuplicateCheck(db, archive, hasTable) {
 const rows = Object.fromEntries(tables.map(table => [table, hasTable(table) ? db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all() : []]));
 const present = tables.some(table => rows[table].length > 0);
 const contents = new Map(rows.duplicate_check_content_files.map(row => [row.file_id, row]));
 const files = rows.duplicate_check_files.map(row => {
  const source = typeof row.file_path === 'string' ? row.file_path.replace(/\\/g, '/') : '';
  const parts = source.split('/');
  const original = parts[0] === 'workspace' && parts.every(safePart) ? archiveFile(archive, parts.join('/')) : { missing: true, reason: 'outside_backup' };
  const contentRow = contents.get(row.file_id), path = typeof contentRow?.content_path === 'string' ? contentRow.content_path.replace(/\\/g, '/') : '';
  const contentParts = path.split('/');
  const matches = safePart(row.file_id) && contentParts.slice(-4).join('/') === `workspace/duplicate-check/contents/${row.file_id}.md`;
  const content = !contentRow?.content_path ? { missing: true, reason: 'not_recorded' } : matches ? archiveFile(archive, `workspace/duplicate-check/contents/${row.file_id}.md`) : { missing: true, reason: 'outside_backup' };
  return { id: row.file_id, original, content };
 });
 // Local absolute paths have no meaning on the server and may reveal user details.
 for (const row of rows.duplicate_check_files) delete row.file_path;
 for (const row of rows.duplicate_check_content_files) delete row.content_path;
 return { present, tables: rows, files };
}
