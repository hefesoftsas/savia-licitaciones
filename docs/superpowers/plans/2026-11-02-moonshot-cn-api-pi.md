# Kimi API para China continental con Pi

Añadir una credencial explícita `moonshot-cn-api` con destino fijo `https://api.moonshot.cn/v1`, separada de Kimi internacional. La [API oficial](https://platform.kimi.com/docs/api/chat) documenta Chat Completions y herramientas en ese destino; la disponibilidad, condiciones y facturación dependen de la cuenta regional. Mantener consentimiento, límites configurados, aislamiento y compatibilidad del catálogo Pi, sin fallback ni utilizar Kimi Coding Plan. No realizar inferencia externa ni despliegue.

1. Probar la selección de proveedor y destino fijo, el protocolo y la conservación del razonamiento mediante Pi simulado.
2. Conectar credenciales cifradas, concesiones y todos los tipos de tarea, con pruebas en Miniflare de aislamiento y revocación.
3. Mostrar la región y el catálogo Pi correspondientes, verificar builds y distribución empaquetada. Documentar las condiciones no verificadas de uso con suscripciones.

**Avance:** la opción regional está integrada en la credencial, catálogo, tareas y runner Pi. Miniflare verificó cifrado, aislamiento, concesión y revocación; las pruebas de Pi simulado ejercitaron herramientas y razonamiento con el endpoint regional y el internacional, también en el runner empaquetado. Se comprobaron los flujos de viabilidad, RUP, evaluación y requisitos y que no se intercambien regiones. Las compilaciones web y escritorio pasaron. No se realizó inferencia con una cuenta real ni se verificaron condiciones individuales de suscripción.
