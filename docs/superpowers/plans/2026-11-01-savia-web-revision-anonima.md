# Revisión anónima en Savia web

**Objetivo:** trasladar la revisión de anonimato y formato del escritorio a tareas ejecutadas por el runner local, sin enviar documentos a un proveedor salvo autorización explícita.

**Diseño:** reutilizar el helper OpenXML, los perfiles y el mapeo del escritorio en un espacio temporal; adaptar la detección de color de imágenes a Node, sin exigir Electron. En etapas siguientes conectar la cola y los informes de usuario, perfiles editables, revisión con Pi y corrección de documentos. El perfil y sus limitaciones deben mostrarse al usuario, sin presentar la revisión programática como garantía de cumplimiento.

1. Probar con DOCX real la inspección, términos sensibles, muestreo de color, cancelación y limpieza de temporales.
2. Implementar adaptador autónomo y empaquetarlo con sus dependencias; comprobar que el helper real funciona en macOS.
3. Incorporar la tarea y la UI a través de la cola con documentos e informes aislados; cubrir cancelación, concesión y persistencia.
4. Agregar perfiles editables, revisión con IA y corrección; verificar paridad e instalación en Windows y macOS.

**Avance:** adaptador de inspección y color incorporado a la distribución preliminar. Se verificó en macOS arm64 tanto en el checkout como en un paquete aislado, con un DOCX generado por el helper y un término sensible. Las pruebas cubren error, temporales, cancelación y color con transparencia; la compilación de escritorio pasó. La tarea aún no está conectada a la cola ni a la interfaz web; tampoco se han migrado perfiles editables, revisión con IA ni reparación. Falta probar Windows y macOS x64.

**Conexión web:** la tarea `blind-check.inspect` se publica en la cola local y su informe se guarda por proyecto; la interfaz selecciona un DOCX y términos sensibles y muestra explícitamente las limitaciones del perfil general del escritorio. Miniflare verificó identidad, resultado, cancelación y eliminación; el recorrido también pasó con el CLI empaquetado en macOS arm64. Compilaron las versiones de escritorio y web. Pendientes: perfiles editables adaptados al pliego, revisión con Pi, corrección automática, pruebas de otras plataformas y revisión visual interactiva.
