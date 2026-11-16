# Migración de hechos globales de escritorio

**Objetivo:** preservar hechos globales de cada proyecto al migrar un respaldo, sin borrar capítulos ni duplicar proyectos ya importados.

**Diseño:** `runner/desktop-backup.mjs` lee los grupos ordenados del proyecto activo y de las instantáneas; `inspect-backup` informa su cantidad sin publicar texto. Una operación independiente e idempotente incorporará los hechos al proyecto existente después de importar documentos, sin cambiar el hash del recibo de creación anterior. Los hechos importados deberán identificarse como procedentes del respaldo y necesitar revisión de fuentes; el usuario podrá confirmarlos sin borrar capítulos. La confirmación y cualquier cambio concurrente requerirán control de versión y captura de fuentes, sin atribuir fuentes que no se hayan importado.

**Restricciones:** mantener la idempotencia de respaldos importados por versiones anteriores; no sobrescribir hechos que el usuario ya editó; conservar texto y orden exactos; no mostrar contenido en la inspección; aislar cuentas; no desplegar.

**Pasos y pruebas:**
1. Hecho: pruebas de lectura del proyecto activo e inactivo, tabla ausente, contenido vacío y orden; lectura y conteo en la inspección.
2. Hecho: importación independiente con recibo inmutable, reintentos, conflictos, aislamiento y transacciones, sin cambiar el recibo anterior ni el texto de capítulos.
3. Hecho: revisión explícita con comprobación de versiones y fuentes; los hechos no pueden usarse hasta confirmar.
4. Integrados el runner y la interfaz es/en, con prueba de importación real, reintentos y documentación. Falta la revisión visual manual en navegador.
5. Ejecutadas las suites del runner y API, compilaciones web y de escritorio, y pruebas de la distribución preliminar.

Decisión: los hechos se adjuntan después de cargar los originales, mediante un recibo nuevo, para mantener válido el recibo de proyectos creados por versiones anteriores. La confirmación registra las fuentes web disponibles en ese momento; no afirma que sean todas las fuentes originales del respaldo.

La procedencia de escritorio permanece visible tras confirmar. La configuración `global_facts_mode` del respaldo puede haberse modificado después de crear los hechos y no demuestra cómo se generaron; no se usa como prueba de su origen. El sitio compilado, la sesión y la confirmación se verificaron con una instancia Miniflare local y datos ficticios. La revisión visual sigue pendiente: el navegador integrado está deshabilitado en la configuración del entorno.
