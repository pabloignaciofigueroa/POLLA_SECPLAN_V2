import { defineConfig } from "astro/config";

// Polla Mundialera SECPLAN 2026 - Clean V2 - Alpha 01
// Configuracion enfocada en estabilidad del primer render.
export default defineConfig({
  build: {
    inlineStylesheets: "always",
  },
  prefetch: {
    // Antes: viewport -> prefetcheaba las 10 rutas del nav apenas cargaba la pagina
    // (~2MB de HTML extra y, en dev, compilacion en frio de cada ruta = picos de ~300ms).
    // hover -> solo prefetchea el link cuando el usuario pasa el mouse (intencion de navegar).
    prefetchAll: true,
    defaultStrategy: "hover",
  },
});
