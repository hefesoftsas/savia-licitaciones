# Recuperación de entregas del runner

- Mantener la regla vigente: una concesión vencida o cancelada no puede finalizar una tarea; una finalización ya confirmada sigue siendo idempotente.
- Guardar temporalmente el resultado redactado y la concesión cifrados en la máquina del usuario antes de enviarlos; la clave se deriva del token local y el contexto del runner. El archivo temporal no es la fuente de verdad de negocio.
- Al reiniciar, reenviar antes de reclamar trabajo nuevo. Eliminar solo después de confirmación; conservar aparte los resultados rechazados por vencimiento o cancelación y permitir exportarlos explícitamente.
- Impedir el reemplazo accidental de la configuración mientras haya resultados cifrados asociados; no imprimir claves ni resultados en logs.
- Probar cifrado, integridad, recuperación, reinicio y los casos de concesión vigente, vencida, cancelada y respuesta perdida. La recuperación no vuelve a ejecutar el agente.
