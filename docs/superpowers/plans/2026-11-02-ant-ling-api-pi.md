# Ant Ling API con Pi

Habilitar el proveedor Ant Ling de Pi con clave de API cifrada por cuenta y destino fijo `https://api.ant-ling.com/v1`. Conservar límites y compatibilidad del catálogo Pi, sin fallback ni inferencia Cloudflare. Mantener el consentimiento por tarea y advertir que los datos se envían al proveedor. No introducir OpenRouter.

Verificar herramientas reales de Pi con transporte simulado, límites, aislamiento de credenciales, concesiones y rutas del runner. Comprobar catálogo, compilación y flujo en Miniflare, sin conexiones reales ni despliegue.

**Estado:** la selección web muestra los modelos de Ant Ling del catálogo Pi instalado; el runner rechaza los identificadores desconocidos antes de conectarse. Se probó Pi con herramientas y respuestas simuladas para Ling y Ring, incluido el reenvío del razonamiento, además de cifrado, concesión, aislamiento y tareas RUP en Miniflare. Compilaron escritorio y web. No se ha probado una clave real ni se garantiza acceso al servicio o disponibilidad de modelos. El endpoint se contrastó con la [documentación oficial de Ant Ling](https://developer.ant-ling.com/zh-CN/docs/getting-started/quickstart/).
