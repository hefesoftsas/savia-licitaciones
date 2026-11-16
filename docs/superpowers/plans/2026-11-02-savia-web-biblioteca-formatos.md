# Formatos del análisis de biblioteca

La biblioteca usa el extractor de licitaciones y debe reflejar en su interfaz los formatos que este admite. Verificar que XLS y XLSX, incluido el MIME genérico habitual, se extraigan localmente y que Pi solo proponga citas literales presentes; DOC/WPS requieren un conversor local compatible. Probar el flujo de biblioteca en Miniflare, aceptación y aislamiento, y el runner empaquetado. Los límites de 300.000 caracteres extraídos y el consentimiento no cambian; no realizar inferencia externa.
