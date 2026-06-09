# 08_equipos — Mapa técnico

## Estado
wireframe-implemented

## Pulso coral - 2026-06-09

- La ficha modal muestra cuantos cartones clasifican a la seleccion y cuantos
  la ponen primera de grupo.
- El detalle se desbloquea con 72/72 local o una entrega oficial y enlaza a
  `/estadisticas?tab=clasificados&team=<id>`.

## Fase 10 - Simplificacion arcade
Album reducido a grupo activo por defecto, filtros A-L y 4 cards. Se retiro el chip "todos", el strip de confederaciones y el texto descriptivo de cards.

## Iteracion arcade por referencia - album por grupos
Se mantiene `Grupo A` como estado inicial y se refuerza el look arcade de los grupos filtrados. Las cards pasan de formato blanco vertical a poster horizontal compacto con portada webp como holder principal, overlay de lectura, favorito, confederacion, descripcion corta y CTA `VER FICHA`.

Regla de assets aplicada:

```txt
El holder `.cover-stage` manda.
El webp de `TeamCoverImage` obedece con width/height 100%, object-fit cover y object-position center top.
Se agrega defensa CSS local-global acotada a [data-section="equipos"] para imagenes dentro de [data-team-cover].
```

Tambien vuelve `ConfederationStrip` como franja inferior liviana de cierre mundialista, no como panel pesado.

## Ruta
/equipos

## Función
Álbum mundialero de las 48 selecciones del Mundial 2026.
Permite navegar selecciones por grupo (A–L), marcar favoritos y
abrir una ficha editorial con datos de juego de cada equipo.
Sección informativa, no juega.

## Componente principal
EquiposSection.astro

## CSS local
EquiposSection.module.css

## Subcomponentes Astro
- EquiposHero.astro — eyebrow + título "ÁLBUM DE SELECCIONES" + bajada.
- TeamsSummaryStrip.astro — 4 stat cards (48 / 12 / 6 / 100%).
- GroupFilterChips.astro — 12 chips A-L, sin opcion "Todos los grupos".
- TeamsAlbum.astro — wrapper que itera GroupSection.
- GroupSection.astro — tira de grupo con ribbon, CTA "Ver grupo completo" + team grid.
- TeamCard.astro — poster horizontal con cover webp, overlay, favorito, nombre, confed, descripcion corta + "VER FICHA".
- ConfederationStrip.astro — barra inferior liviana con 6 confederaciones.
- TeamDetailModal.astro — `<dialog>` nativo con detalle editorial (título, info secundaria/terciaria, formaciones, jugadores clave, fortaleza/riesgo, tags).

## Lógica
- equipos.logic.ts
  - buildInfoIndex / enrichTeams (merge teams.json ↔ equipos-info.json)
  - NAME_ALIAS (Türkiye ↔ Turquía)
  - groupByGroupId (A–L)
  - uniqueConfederations (orden UEFA → OFC)
  - shortDescription (titulo → info_secundaria → fallback)
- equipos.client.js — hidratación scoped [data-section="equipos"]:
  - filtro de grupo A-L; el estado inicial es Grupo A
  - "Ver grupo completo" filtra + scrollIntoView (respeta reduced-motion)
  - favoritos persistidos en polla:favoriteTeams
  - modal con `dialog.showModal()` + cierre por ESC / backdrop / botón

## Data
- src/data/teams.json — 48 selecciones (id, name, shortCode, group, confederation).
- src/data/equipos-info.json — copia editorial con `equipos[]`
  (seleccion, titulo, informacion_secundaria, informacion_terciaria,
   formaciones, especial.{tipo, fortaleza, riesgo, jugadores_clave_mencionados, tags}).
- Match por `team.name` con alias para Türkiye → Turquía (47/48 directos).

## LocalStorage
- polla:favoriteTeams — array JSON de team ids. Única clave que esta sección escribe.

## Comportamiento
- Filtro por grupo A-L oculta otras GroupSection sin desmontarlas.
- "Ver grupo completo" funciona como atajo de filtro + scroll.
- "Ver ficha" abre modal con detalle editorial (o nota "ficha pendiente" si no hay info).
- Favoritos persisten entre sesiones.

## Assets pendientes
- public/assets/flags/ (banderas reales — Fase 4)
- public/assets/players/ siluetas o crops por selección (Fase 4)
- backgrounds/08_equipos_background.png (Fase 3, opcional)

## Restricciones
- No usar CSS global.
- No usar imagen como fondo total.
- 12 grupos A–L (la imagen muestra solo A–H, pero la arquitectura los genera todos).
- Navbar activo: Equipos.
- JS scoped con [data-section="equipos"].
- Sin librerías.
- Sin `!important`.
- Modal usa `<dialog>` nativo (sin polyfill).

## Checklist
- [x] ruta /equipos renderiza solo esta sección
- [x] 48 cards en 12 grupos A–L
- [x] match editorial 47/48 directos + alias Türkiye
- [x] favoritos persisten en localStorage
- [x] modal funcional con ESC + backdrop + botón
- [x] responsive base (1080 + 720 + 560 breakpoints)
- [x] prefers-reduced-motion respetado en scrollIntoView
- [x] .map.md actualizado
- [x] sin clases globales de componente

## Fase 3A — visual base
- Aplicada: fonts oficiales (Barlow Condensed + Inter + Rajdhani), tokens `--pm-*`, color local `--section-bg` + accents.
- Navbar global azul tinta con activo amarillo. CTAs principales en amarillo (CTA rey).
- Pendiente: assets finales (Fase 4).
- Fecha: 2026-05-23.


## Fase 11 - Assets WebP master integrados (2026-05-30)

Ruta publica: `site/public/assets/polla-mundialera/`. Regla: el holder manda; `<img>` con `object-fit:contain` + `width/height` (anti-CLS); sin tocar CSS global, tokens, rutas, storage ni datos.

- TeamsSummaryStrip: 4 glifos -> `badge-shield-star-gold` / `icon-football-blue` / `07-icon-card-players-blue` / `emblem-laurel-star-gold`; chips suavizados a tinte claro.
- Banderas, escudos y portadas reales (Fase 7) NO se tocan.
