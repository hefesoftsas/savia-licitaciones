# Inteligencia de mercado web

**Objetivo:** ofrecer consultas de PAA, contratos SECOP II y órdenes de Tienda Virtual, junto con el resumen agregado de contratos disponible en escritorio.

**Diseño:** una API autenticada, activada por la persona usuaria, valida filtros y paginación y llama al servicio público existente. La interfaz mantiene filtros aplicados separados de los editables, permite navegar páginas y calcular agregados explícitamente y enlaza a las fuentes oficiales. Mantiene las advertencias sobre cobertura, moneda y cifras. El seguimiento persistente de planes y sus avisos todavía requiere migración y se declara pendiente.

1. Probar las tres fuentes, filtros y escape SoQL, paginación, agregados, aislamiento de sesión y fallos con Miniflare y datos simulados.
2. Implementar rutas de búsqueda y agregación reutilizando el servicio existente.
3. Integrar interfaz es/en y verificar compilaciones y pruebas sin conectar a recursos de producción.

**Estado:** búsquedas y resumen integrados con el servicio del escritorio y datos simulados en Miniflare. El seguimiento PAA y sus avisos están disponibles con la web abierta; los seguimientos históricos se pueden importar; queda pendiente la revisión visual en navegador.
