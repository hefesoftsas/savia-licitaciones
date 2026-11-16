# Búsquedas automáticas con el runner local

**Objetivo:** permitir que un cliente autorice búsquedas de oportunidades aunque cierre la web, mientras su runner local compatible esté conectado.

**Diseño:** añadir una opción independiente desactivada por defecto y guardar el idioma elegido. El runner consulta periódicamente un endpoint autenticado que reutiliza la concesión, las fuentes y el límite de seis horas existentes. La API exige la opción y el consentimiento al reclamar la concesión y al encolar; desactivarla durante la búsqueda impide crear el trabajo. Los análisis se ejecutan con Pi en el runner, sin Cron ni runner alojado. Las opciones antiguas mantienen su comportamiento.

**Verificación:** Miniflare cubre opción predeterminada, aislamiento, dos runners simultáneos, revocación durante la búsqueda, idioma y ausencia de trabajos sin autorización. Pruebas del runner cubren cadencia, fallos y cierre; pruebas de interfaz y compilaciones cubren español e inglés.

**Estado:** implementado con una segunda opción de consentimiento desactivada por defecto. La comprobación se inicia cuando un runner compatible queda libre, como máximo una vez cada quince minutos por proceso, y no bloquea la recepción de otras tareas. La concesión D1 evita duplicados entre runners y pestañas; el servidor mantiene el intervalo de búsqueda y vuelve a comprobar la autorización al encolar. Si se cierra el runner, las búsquedas esperan a que vuelva a conectarse. No se activó ningún Cron ni runner en la nube.
