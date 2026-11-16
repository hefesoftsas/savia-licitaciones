# Consumo de caché en OpenCode Go

Conservar el detalle de tokens cacheados de Responses al traducirlo a Chat Completions y a los eventos de Pi. Los tokens cacheados son parte de la entrada total, no una cantidad adicional. Conservar también el detalle de razonamiento sin sumarlo a la salida. No convertir tokens a precios. Si el proveedor envía datos de consumo contradictorios o incompletos, no fabricar cifras. Aclarar que el detalle de caché depende de lo informado por el proveedor.

Probar conversión, tokens cacheados por múltiples llamadas con Pi, ausencia de datos, entrega en Miniflare y distribución del runner, sin inferencia ni despliegue externo.
