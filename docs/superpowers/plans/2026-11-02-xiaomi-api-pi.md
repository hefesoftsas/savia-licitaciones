# Xiaomi MiMo API con Pi

Añadir la API estándar de Xiaomi MiMo como proveedor opcional por cliente, con clave propia, destino fijo `https://api.xiaomimimo.com/v1` y el protocolo de Pi instalado. La documentación oficial exige devolver `reasoning_content` en turnos con herramientas cuando está habilitado el razonamiento. No habilitar Workers AI ni OpenRouter, ni asumir que los planes regionales de tokens son equivalentes a la API estándar.

1. Probar con un proveedor simulado varias llamadas de herramientas y comprobar que el razonamiento y los límites sobreviven a los turnos, sin exponer la clave ni usar red externa.
2. Incorporar configuración nativa y catálogo Pi, credenciales cifradas, y todos los controles de cola y concesión de las funciones compatibles; no habilitar el proveedor parcialmente en la interfaz.
3. Verificar aislamiento y límites en Miniflare, regresiones de funciones Pi, interfaz es/en, compilaciones y runner empaquetado. No realizar inferencia real ni despliegue.

La disponibilidad de modelos puede cambiar: la plataforma oficial indica que MiMo-V2.5 y MiMo-V2.5-Pro fueron retirados el 21 de octubre de 2026, aunque aún aparezcan en la versión instalada del catálogo Pi. La interfaz no debe presentarlos como disponibles sin comprobación externa; permitir que el usuario introduzca un modelo vigente y aclarar que la disponibilidad depende de su cuenta.

Fuente: [Xiaomi MiMo: razonamiento entre turnos](https://platform.xiaomimimo.com/docs/en-US/usage-guide/passing-back-reasoning_content) y [plataforma Xiaomi MiMo](https://platform.xiaomimimo.com/).

**Avance:** Xiaomi está disponible en la interfaz y en las tareas compatibles. Las pruebas verificaron el cifrado y aislamiento de credenciales, las concesiones, dos llamadas simuladas de herramientas, la devolución de `reasoning_content` y los límites. Pasaron las compilaciones web y de escritorio, las pruebas dirigidas y la prueba simulada en una distribución macOS ARM del runner. No se ha realizado una llamada real ni un despliegue; la disponibilidad de cada modelo debe comprobarse con la cuenta del cliente.
