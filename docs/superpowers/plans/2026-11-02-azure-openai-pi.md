# Azure OpenAI Responses con Pi

Integrar Azure OpenAI por cliente mediante clave de API, recurso y nombre de implementación propios. Pi usa el protocolo Responses y Azure recibe el nombre de implementación como `model`; una suscripción de ChatGPT no proporciona este acceso. No modificar variables de entorno globales del proceso, ya que distintos trabajos pueden pertenecer a clientes diferentes.

1. Comprobar con transporte simulado el destino por recurso, la implementación, la cabecera de API, las herramientas, los límites y el aislamiento entre clientes. Rechazar destinos que no correspondan al dominio admitido antes de enviar una credencial.
2. Incorporar el recurso a la credencial y su concesión, sin mostrar la clave; verificar migración, rotación y aislamiento en Miniflare. Mantener compatibles las credenciales existentes.
3. Registrar el proveedor nativo de Pi con configuración por sesión, conectar los controles de tareas y añadir los campos y textos es/en necesarios. No ofrecer OAuth ni otros servicios Azure como parte de esta integración.
4. Ejecutar pruebas dirigidas, compilaciones y verificación del runner empaquetado con respuestas simuladas. No hacer llamadas reales ni desplegar.

Referencias: [API Responses de Microsoft Foundry](https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/responses) y [nombres de implementación](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/endpoints?tabs=python).

**Avance:** se incorporaron recurso e implementación por cliente, almacenamiento de la clave cifrada, concesión al runner, validaciones de tareas y formulario es/en. Las pruebas simuladas comprueban dos clientes, herramientas, límites y aislamiento frente a variables globales; las pruebas dirigidas y las compilaciones web y de escritorio pasaron. La distribución preliminar macOS ARM pasó la prueba simulada. No se ha realizado inferencia real ni un despliegue.
