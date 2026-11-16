'use strict';
const missing = /【(?:待填写|待补充)】|[\[【]\s*pendiente\s+por\s+completar\s*[\]】]/gi;
const confirm = /【待确认】|[\[【]\s*pendiente\s+por\s+confirmar\s*[\]】]/gi;
const normalizePendingMarkers = value => String(value ?? '').replace(missing, '[Pendiente por completar]').replace(confirm, '[Pendiente por confirmar]');
const hasPendingMarkers = value => /【(?:待填写|待补充|待确认)】|[\[【]\s*pendiente\s+por\s+(?:completar|confirmar)\s*[\]】]/i.test(String(value ?? ''));
module.exports = { normalizePendingMarkers, hasPendingMarkers };
