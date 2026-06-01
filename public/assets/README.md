# Assets — Polla Mundialera SECPLAN 2026 Clean V2

Esta carpeta recibirá los assets finales después de aprobar el wireframe.

Carpetas previstas:

- `backgrounds/`   — fondos por sección (WebP / AVIF)
- `players/`       — avatares de los 14 jugadores (PNG con transparencia)
- `trophy/`        — copa aislada, brillos, partículas (PNG / SVG)
- `flags/`         — banderas de selecciones (SVG)
- `ui/`            — íconos, badges, decoraciones UI (SVG)
- `brand/`         — logos SECPLAN, branding general (SVG)

## Reglas de nombrado

Permitido:
```
bg-01-inicio-clean.webp
bg-07-fixture-clean.webp
trophy-worldcup-isolated.png
player-chelo-arcade.webp
flag-argentina.svg
icon-trophy.svg
ui-glow-yellow.svg
```

Prohibido:
```
imagen-final-final-v3-ok.png
nuevo-bg-ahora-si.png
copa-buena-2.png
fondo-lindo.png
```

## Reglas de uso

- No cargar assets finales en esta fase.
- No resolver secciones como imágenes únicas.
- Cada imagen aprobada se traducirá a estructura Astro + zonas funcionales + CSS local.
- Preferir WebP para fondos, SVG para íconos/banderas, PNG solo cuando se requiera transparencia fina.
- Evitar GIF pesado: usar WebM/MP4/CSS animation/sprite sheet.
