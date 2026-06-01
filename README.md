# Polla Mundialera SECPLAN 2026 — Clean V2 — Alpha 01

Proyecto Astro base. **Fase 1: Skeleton + Wireframe.**

No es la página final. Es la casa, no los muebles.

## Cómo correr

```powershell
npm install
npm run dev
```

Por defecto se abre en `http://localhost:4321/`.

## Rutas disponibles

Una sección = una ruta. **No es una landing con scroll vertical entre secciones.**
El único elemento común entre vistas es el `Header` + `Footer`.

| Ruta | Sección |
|---|---|
| `/` | Inicio |
| `/reglas` | Reglas |
| `/jugador` | Jugador |
| `/predicciones` | Predicciones |
| `/tabla` | Tabla |
| `/proximo-partido` | Próximo Partido |
| `/fixture` | Fixture |
| `/equipos` | Equipos |
| `/estadisticas` | Estadísticas |
| `/admin` | Admin |
| `/wireframe` | Vista técnica (no representa navegación final) |

## Estructura

```
src/
├── pages/          → index.astro, wireframe.astro
├── layouts/        → BaseLayout.astro
├── styles/         → reset, tokens, fonts, accessibility (globales mudos)
├── components/
│   ├── layout/     → Header, Footer, MobileMenu
│   ├── ui/         → ArcadeButton, ArcadeCard, SectionTitle, StatusPill, LockedPanel, EmptyState
│   └── wireframe/  → WireframeBox, WireframeGrid, WireframeLabel
├── sections/       → 10 secciones, cada una soberana (carpeta + Astro + CSS Module + .map.md)
└── data/           → README (placeholders futuros)

public/
└── assets/         → carpetas preparadas (vacías por ahora)
```

## Filosofía técnica

```
Globales mudos.
Secciones soberanas.
Componentes pequeños.
Wireframe antes que arte.
```

- Los archivos en `src/styles/` solo definen tokens, reset y accesibilidad. **No estilan componentes.**
- Cada sección tiene su propio CSS Module. No depende de otras secciones.
- Sin animaciones complejas todavía. Sin assets finales todavía. Sin lógica real todavía.

## Estado actual

- [x] Estructura Astro creada
- [x] 10 secciones placeholder
- [x] `/wireframe` operativo
- [x] Globales mínimos
- [ ] Arte final (Fase posterior)
- [ ] Assets finales (Fase posterior)
- [ ] Lógica de predicciones, tabla, estadísticas (Fase posterior)
- [ ] Admin funcional (Fase posterior)
- [ ] Conexión real de JSON (Fase posterior)
