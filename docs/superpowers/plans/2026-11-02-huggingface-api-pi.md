# Hugging Face Inference Providers con Pi

Permitir credenciales cifradas de Hugging Face por cuenta en todos los flujos de texto ya compatibles, con el transporte nativo OpenAI-compatible de Pi y destino fijo `https://router.huggingface.co/v1`. Mantener el modelo, límites y consentimiento del usuario; avisar que Hugging Face puede enrutar datos a proveedores de inferencia externos. Usar el catálogo Pi instalado sin garantizar acceso ni compatibilidad de herramientas. Sin fallback ni inferencia Cloudflare.

Probar llamadas de herramientas de Pi con transporte simulado, selección del modelo y credencial, aislamiento de cuentas y concesión del runner en Miniflare y distribución independiente. Sin inferencia externa ni despliegue real.
