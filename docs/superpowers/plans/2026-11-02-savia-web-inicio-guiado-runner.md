# Inicio guiado del runner local

**Objetivo:** facilitar el primer uso del runner distribuido sin cambiar sus credenciales ni iniciar servicios alojados.

**Diseño:** un lanzador local detecta si existe la configuración. Si no existe, pide la dirección, el nombre del equipo y el código temporal; ejecuta el emparejamiento existente como proceso hijo sin interpolar una shell ni poner el código en argumentos. Si el emparejamiento falla no inicia tareas. Si ya existe configuración, inicia directamente el bucle existente. Los archivos de inicio de macOS, Windows y Linux llaman al lanzador desde la carpeta de distribución; requieren Node 22.13 o posterior. No instalan ni ejecutan un servicio en segundo plano y no sustituyen al instalador futuro.

1. Probar el flujo con procesos hijos simulados: primera conexión, error, configuración existente y ausencia de código en argumentos.
2. Implementar lanzador y archivos de arranque; incorporar los archivos al empaquetador.
3. Verificar el paquete generado en la plataforma disponible y documentar límites y uso; mantener intactos los comandos existentes.

**Avance:** inicio guiado incluido en la distribución; la pantalla web muestra la dirección y los pasos. Las pruebas comprueban el emparejamiento con el CLI real y un servidor simulado, que no se inicia tras un error, el código fuera de los argumentos y Node mínimo. El paquete macOS arm64 pasó la prueba y se verificaron compilaciones web y de escritorio. Windows y Linux tienen archivos de arranque, pero no se han ejecutado en esos sistemas; tampoco se ha probado un doble clic en interfaz gráfica ni hay instalación o inicio automático. No se ha desplegado infraestructura.
