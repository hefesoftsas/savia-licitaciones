# Imágenes de certificados en Savia web

**Objetivo:** conservar y administrar las imágenes de certificados, tanto cargadas en la web como recuperadas del respaldo.

**Diseño:** imágenes individuales en R2 con metadatos privados por cuenta y certificado en D1. Las cargas usan staging durable y solo se vinculan si el certificado sigue existiendo. Una eliminación transaccional retira la imagen y crea un registro de limpieza antes de borrar de R2; los fallos se reintentan. Al eliminar un certificado sus imágenes se retiran de forma equivalente y la limpieza queda recuperable. La migración lee archivos solo dentro del respaldo, preserva metadatos y orden y usa recibos idempotentes; informa imágenes ausentes o inseguras sin leer rutas externas. No se habilita cómputo alojado.

1. Probar carga, descarga, aislamiento, rechazo de archivos inválidos y reintento de limpieza; probar carreras entre cargas y eliminación del certificado.
2. Construir almacenamiento y operaciones en la API con pruebas Miniflare.
3. Integrar imágenes en la interfaz y verificar uso de teclado, compilaciones y errores.
4. Probar e implementar migración desde respaldo, idempotencia y originales ausentes; comprobar el runner empaquetado.

**Avance:** carga múltiple, consulta y eliminación web implementadas. La limpieza tiene registros duraderos y permite reintentar fallos de R2; las pruebas cubren aislamiento, errores y carga concurrente con eliminación. La importación transfiere imágenes disponibles y comunica las ausentes o incompatibles. La revisión visual sigue pendiente.

**Migración detallada:** el runner identifica cada imagen por su ID, lee únicamente rutas relativas seguras bajo `workspace/credential-library`, preserva nombre original, nombre personalizado, fecha y orden, e informa por separado ausencias, rutas inseguras y archivos incompatibles. La API vincula imágenes al recibo del certificado y usa staging y recibos separados por imagen; reintentos no recrean imágenes retiradas ni sobrescriben archivos. Las cargas simultáneas y la eliminación del certificado se resuelven en transacciones D1.
