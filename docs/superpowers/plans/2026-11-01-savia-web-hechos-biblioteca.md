# Entradas de biblioteca en hechos globales

**Objetivo:** permitir seleccionar entradas de conocimiento aceptadas como fuentes opcionales al generar hechos globales con Pi.

**Arquitectura:** el cliente selecciona entradas y revisiones, autoriza su envío y las incluye en la tarea. La API vincula IDs y revisiones a la instantánea y exige propiedad; el runner recibe solo las entradas elegidas. Las verificaciones de D1 invalidan tareas y hechos cuando cambian esas entradas o su documento. Los hechos aprobados siguen sujetos al consentimiento ya requerido al redactar capítulos.

**Tecnologías:** D1, Better Auth, Miniflare, React, Pi; diseño en `docs/superpowers/specs/2026-11-01-savia-web-runner-design.md`.

## Condiciones
- Hasta 30 entradas aceptadas, con autorización específica ligada a selección y credencial; no enviar archivos originales.
- No enviar entradas de otros clientes, ni entradas no seleccionadas, ni inferir consentimiento.
- Las tareas anteriores sin selección mantienen compatibilidad; los cambios en entradas no elegidas no invalidan los hechos.
- La revisión del índice, eliminación de entrada o documento invalidan de forma atómica la tarea y los hechos derivados.
- Sin despliegue, proveedor adicional, Workers AI ni ejecución alojada.

## Verificación
1. Miniflare: usuarios aislados, selección sin consentimiento, IDs ajenos, autorización obsoleta, entrada opcional, cambios y eliminación; comprobar protección de aceptación y borradores.
2. Runner Pi con proveedor simulado: solo entradas autorizadas en contexto, citas de fuente, descarte al faltar consentimiento; mantener limpieza y tareas previas.
3. Interfaz es/en de búsqueda, selección, confirmación y estados; indicar cuando los hechos usan conocimiento aceptado.
4. Ejecutar pruebas completas de API y runner y compilaciones cliente y web.
