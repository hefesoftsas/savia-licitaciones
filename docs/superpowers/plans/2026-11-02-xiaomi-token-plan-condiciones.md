# Condiciones del Token Plan de Xiaomi

La [documentación oficial](https://mimo.mi.com/docs/en-US/tokenplan/Token%20Plan/subscription) reserva el Token Plan para herramientas de programación y excluye solicitudes claramente ajenas a programación realizadas mediante scripts o backends personalizados. El análisis y generación de licitaciones de Savia no se ofrecen como uso permitido del Token Plan. Mantener disponible la API estándar, que se factura por separado, y no configurar los destinos regionales del plan.

1. Rechazar al crear credenciales de Xiaomi API claves identificadas como Token Plan (`tp-` o `ttp-`); repetir la comprobación antes de ejecutar una credencial existente.
2. Explicar la distinción en la interfaz es/en y la documentación, sin presentar como permiso las condiciones de otro producto.
3. Verificar la validación y el aislamiento de credenciales con Miniflare y runner; no hacer solicitudes reales ni desplegar.

**Avance:** la API y el runner rechazan los prefijos documentados, la interfaz explica el motivo en español e inglés y enlaza las condiciones originales. Las claves antiguas con esos prefijos también se rechazan antes de ejecutar la tarea. Los prefijos no demuestran por sí solos qué condiciones se aplican a cualquier otra clave; el usuario debe revisar su cuenta y contrato.
