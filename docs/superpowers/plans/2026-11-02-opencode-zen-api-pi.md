# OpenCode Zen con Pi

Objetivo: permitir al cliente usar su propia clave Zen con los modelos textuales del catálogo Pi y los protocolos declarados por modelo. Verificar cada URL y API contra una lista fija de destinos de OpenCode; rechazar modelos desconocidos y no redirigir a otro proveedor. Mantener límites, consentimiento y la ruta existente de Go. No inferencia Cloudflare ni OpenRouter.

Probar solicitudes y herramientas simuladas para cada familia de protocolo, aislamiento y cifrado de credenciales, errores y compilaciones. Informar que Zen puede generar cargos y que la disponibilidad, condiciones y datos dependen de cada modelo; sin inferencia real ni despliegue.

**Estado:** selección web y credenciales cifradas por cuenta conectadas al catálogo Pi. El runner valida tanto el protocolo como el destino del modelo antes de usar la clave; soporta las cuatro familias presentes en ese catálogo. Pruebas de Pi con herramientas simularon Chat Completions, Responses, Messages y Gemini; un modelo desconocido se rechaza antes de conectar. Miniflare verifica la concesión y aislamiento. No se usó una clave real ni se garantiza disponibilidad o precio. Fuente: [documentación de Zen](https://dev.opencode.ai/docs/zen/).

La documentación vigente de [OpenCode Go](https://opencode.ai/v2/docs/console/go/) indica que sus modelos de texto se pueden traducir entre APIs, por lo que la ruta Responses existente se conserva. También describe Go como diseñado para agentes de programación y solicita tráfico típico de esos agentes: la web informa al cliente que revise si su uso con licitaciones está permitido. La documentación no autoriza de forma inequívoca este caso de uso y no se ha verificado con OpenCode.
