# Vertex AI Express con Pi

Conectar Vertex AI del catálogo Pi con clave de Google Cloud en modo exprés, destino global fijo, selección y límites por cliente y sin utilizar credenciales predeterminadas ni cambiar a Gemini API. Rechazar los marcadores que Pi interpreta como credenciales locales, incluso si llegan desde una configuración antigua. La compatibilidad con ADC y cuentas de servicio no forma parte de este primer método y no se afirma soportada.

Probar herramientas Pi con transporte simulado, aislamiento y cifrado en Miniflare, colas y servicios de cuenta, catálogo y representación es/en; compilar web y escritorio y comprobar el runner empaquetado. Sin inferencia real ni despliegue.

**Estado:** selección y claves separadas en web y runner; Pi ejecutó lectura de documentos mediante respuestas simuladas dirigidas al endpoint global. Pasaron 108 pruebas focalizadas, compilaciones web y escritorio, diagnóstico macOS ARM64 y pruebas del runner empaquetado. No se ha usado una clave real ni probado Windows o Linux. El modo exprés es un subconjunto de Vertex; los métodos ADC y cuenta de servicio siguen pendientes. Documentación de Google: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/googlegenaisdk-vertexai-express-mode.
