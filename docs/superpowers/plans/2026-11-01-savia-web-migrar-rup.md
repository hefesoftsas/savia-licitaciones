# Migración del RUP de escritorio

**Objetivo:** importar el certificado RUP actual de la empresa y sus datos revisados a la cuenta web mediante el runner, sin sustituir un certificado existente ni atribuir al PDF datos de otra versión.

**Diseño:** el lector toma `rup_certificate` y únicamente hechos cuyo `certificate_name` coincide con el archivo actual en `workspace/credential-library/rup/`; informa si el PDF no está en el respaldo. `inspect-backup` solo informa presencia y cantidad. El comando explícito `import-rup` envía el PDF y los hechos al endpoint del runner, que valida el PDF y sus páginas, conserva fecha y valores y usa recibo idempotente. D1 guarda certificado, datos y selección actual en una transacción; si ya existe un certificado web, devuelve conflicto. Una carga en R2 usa staging recuperable y la limpieza reconoce certificados vinculados. Reintentos no revierten cambios posteriores.

1. Probar respaldo con hechos actuales, históricos y PDF ausente; no mostrar valores en inspección.
2. Probar en Miniflare propiedad, página, PDF, reintentos, conflicto, concurrencia y limpieza de fallos.
3. Integrar CLI, documentar y verificar la distribución. Certificados históricos y comparaciones RUP quedan pendientes; no desplegar.

**Estado:** lectura, importación idempotente por cuenta y limpieza de cargas implementadas. Verificadas sustitución posterior, aislamiento, concurrencia, datos históricos excluidos, fallo D1 y uso del CLI con un respaldo de prueba. El resultado no afirma autenticidad ni vigencia del certificado.
