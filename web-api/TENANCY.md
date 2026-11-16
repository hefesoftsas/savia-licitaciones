# Organizaciones y usuarios

Cada usuario pertenece a una organización. Sus miembros comparten proyectos, documentos, datos de empresa, biblioteca, tareas y conectores; las preferencias de apariencia y el último proyecto seleccionado siguen siendo personales. Las tareas se entregan únicamente a conectores de la misma organización.

Un superadministrador puede crear y renombrar organizaciones, crear cuentas nuevas y asignar o reasignar usuarios existentes a cualquier organización desde la sección **Administración** (disponible en el menú lateral y en el menú de usuario) o desde **Cuenta → Organizaciones y usuarios**. La contraseña inicial se entrega al usuario por un canal apropiado; no aparece en la lista después de crearla. El registro público sigue desactivado salvo que se habilite expresamente `AUTH_ALLOW_REGISTRATION`; si se habilita, una cuenta registrada recibe su propia organización al comenzar a usar la aplicación y luego puede asignarse a otra organización.

La migración `0170_tenants.sql` crea una organización por cada cuenta existente, conservando sus datos y conectores. En instalaciones existentes, respaldar D1 y el almacenamiento de archivos antes de migrar, aplicar las migraciones D1 y actualizar el Worker y la aplicación juntos. La migración no mueve objetos del almacenamiento de archivos. No ejecutar una migración remota como parte de las pruebas locales.

Por compatibilidad con los datos anteriores, el identificador interno de almacenamiento de una organización corresponde actualmente a su primera cuenta. Esa cuenta no se puede eliminar mientras sea propietaria del espacio; suspender el acceso es posible. La transferencia de propiedad y la eliminación de organizaciones todavía no están implementadas.
