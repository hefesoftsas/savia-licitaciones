# Revisar y exportar hallazgos de rechazo

**Objetivo:** permitir retirar hallazgos de una revisión y exportar el estado revisado, conservando los cambios en la nube.

**Diseño:** mantener el informe original en R2 y registrar las retiradas por tarea y sección en D1; la consulta y descarga aplican el mismo filtro, sin modificar otro informe ni reactivar hallazgos en reintentos. Verificar propietario, tarea finalizada y existencia inequívoca del hallazgo. El Excel se genera desde el informe filtrado en el navegador y conserva los textos como celdas literales.

1. Probar aislamiento, reintentos y descarga filtrada; impedir escrituras después de eliminar el informe.
2. Implementar persistencia de retiradas, gestión en la interfaz y exportación de cuatro hojas es/en.
3. Verificar el libro mediante lectura de vuelta, Miniflare y compilaciones; la revisión visual en navegador queda pendiente si no está disponible.

**Verificación:** pruebas de revisión, aislamiento, eliminación y Excel aprobadas en Miniflare; revisión ejecutada también con el runner empaquetado. Las compilaciones de escritorio y web terminaron correctamente. Pendiente la comprobación visual en navegador y una prueba con un proveedor real.
