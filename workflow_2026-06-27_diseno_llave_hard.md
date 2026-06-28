# Workflow 2026-06-27 — DISEÑO HARD: LLAVE (árbol espejo R32 → Final)

Codename: **LLAVE HARD**. La base funcional del bracket está lista y verificada (build verde,
74 tests). Este doc es el **playbook de la fase de DISEÑO** sobre `/fixture` (y de rebote
`/predicciones`), anclado a [DESIGN.md](DESIGN.md) y a [tokens.css](src/styles/tokens.css).

> ESTADO: **base lista, diseño NO iniciado.** Modo LOCAL_AISLADA (sin backend, sin commit).
> Documento hermano: el rediseño funcional quedó documentado en
> `src/sections/07_fixture/fixture.map.md`. Regla madre: **identity-preservation manda**
> (DESIGN.md §8) — la identidad arcade-luminosa gana sobre cualquier impulso de skin nuevo.

---

## 0. Qué ya existe (la base, NO rehacer)

| Archivo | Rol |
|---|---|
| `src/lib/knockout/bracketTree.js` | Topología LEFT/CENTER/RIGHT derivada de `winnerTo` (post-orden). Puro. |
| `tests/bracket-tree.test.mjs` | 5 tests TDD del split (orden exacto vs referencia). |
| `src/sections/07_fixture/BracketTree.astro` | Layout flex anidado + capa SVG de conectores + centro Final/trofeo. |
| `src/sections/07_fixture/bracket-tree.client.js` | Mide nodos (offsetLeft/Top), dibuja elbows y ajusta el árbol al ancho. |
| `src/sections/07_fixture/BracketLegend.astro` | Leyenda de estados. |
| `src/sections/07_fixture/BracketMatchCard.astro` | + `variant="node"` (compacto, hooks intactos). |
| `src/sections/07_fixture/FixtureSection.astro` | Monta árbol + leyenda; conserva payload + cliente de hidratación. |

**Contrato intocable:** los nodos conservan `data-ko-match/flag/name/score/advance/status-pill`,
así `fixture.bracket.client.js` sigue hidratando equipos/ganadores/desbloqueo. Estado-cero
respetado (R16+ = "Ganador P##", nunca pre-hornear). El diseño **no rompe** estos hooks.

---

## 1. Norte de diseño

La llave es **página-PRODUCTO** (DESIGN.md §1): dials **Variance 4 · Motion 3 · Density 7**.
No es un poster: es un tablero de torneo legible y denso, con chispa arcade controlada.

Objetivo: que se sienta **bracket de transmisión deportiva premium**, no "div boxes con líneas".
Referencias de calidad: ESPN/UEFA bracket, FIFA app, EA Sports tournament tree — pero en clave
**arcade-luminosa clara** (no dashboard oscuro). El "wow" es la lectura instantánea de todo el
camino R32 → Final y la **ceremonia del centro** (Final + trofeo).

---

## 2. Auditoría DESIGN.md (violaciones a corregir en esta fase)

La base funciona pero pisa reglas de DESIGN.md §7 que el diseño DEBE limpiar:

1. **Ghost-card (§2 Sombras / §7):** los nodos usan `border 1px` + `box-shadow` ≥16px
   (`--pm-shadow-soft` = 30px) en el mismo elemento. **Elegir UNA**: o borde nítido sin
   sombra ancha, o sombra tintada sin borde. → rediseñar la elevación del nodo.
2. **Estado nunca por color solo (§4 / §2):** las píldoras (Por jugar / Bloqueado / Completo)
   son texto+color pero **sin ícono**. Sumar ícono por estado (candado / check / balón) — usar
   `StatusPill` o íconos de `lib/ui-assets/uiAssets.ts`.
3. **Números tabulares (§3):** match-id, fechas y marcadores en `--font-score`/tabular-nums
   de forma consistente en el nodo.
4. **Motion con propósito y <300ms (§6):** el árbol no anima nada aún. El reveal/escala debe
   ser CSS nativo, transform/opacity, con `prefers-reduced-motion`. NADA de loops "porque sí"
   (dial Motion=3). El `transform: scale` de ajuste-a-ancho no es animación (ok).
5. **Sin gradient-text decorativo (§7):** verificar que ningún label del bracket use
   `background-clip:text` (hoy el centro usa color sólido — mantener).
6. **Eyebrows/over-rounding (§5/§7):** nodos en radio 10–16px (ok); no subir a 24/32px.

---

## 3. Fases de diseño

### D0 — Compliance + cimientos (limpiar antes de adornar)
- [ ] Resolver ghost-card del nodo (decisión de elevación: borde O sombra).
- [ ] Tokenizar el nodo: introducir vars locales del bracket (`--ko-node-*`) para alto,
      radios, line-weight de conectores → un solo lugar para escalar el diseño.
- [ ] Tabular-nums en id/fecha/marcador.

### D1 — Diseño del NODO (la unidad)
- [ ] Jerarquía interna: equipo > estado > meta(id/fecha). Bandera más protagonista.
- [ ] Estados completos (DESIGN.md §4): default / hover / focus-visible / **ganador** /
      **bloqueado** / **completo** / **placeholder "por definir"**. Cada uno con color **+ ícono**.
- [ ] Realce del **ganador** premium (no solo texto verde): fondo sutil + check + peso.
- [ ] Placeholder ("Ganador P##", "3º C/E/F/H/I") con tratamiento propio (fantasma, no error).
- [ ] Decidir si el nodo muestra **código (RSA)** o **nombre (Sudáfrica)** — ver §5 decisiones.

### D2 — Conectores con alma
- [ ] Elevar el SVG: grosor/curvatura, color por estado (neutro vs **cian del ganador**
      cuando haya resultado), unión limpia al borde del nodo.
- [ ] Evaluar elbows redondeados vs rectos vs curva bezier suave (broadcast feel).
- [ ] Conector de la Final y del 3er puesto (líneas que "entran" al centro con ceremonia).

### D3 — Centro = CEREMONIA
- [ ] La Final como clímax: trofeo + marco/glow dorado **controlado** (no neón permanente),
      tipografía display, el cruce P104 destacado del resto.
- [ ] Tercer puesto sobrio (bronce), claramente secundario.
- [ ] Etiquetas de ronda espejadas (16avos · 8vos · 4tos · SEMI · FINAL · SEMI · …) con ritmo.

### D4 — Tipografía + densidad (lente producto)
- [ ] Escala display/score por nivel; contraste ≥1.25 entre pasos (§3).
- [ ] Densidad alta pero respirada; ritmo de espaciado coherente con tokens.

### D5 — Motion con propósito (Motion=3)
- [ ] Reveal de entrada del árbol por columnas/etapas (transform/opacity, escalonado leve).
- [ ] Hover/foco de nodo: feedback 100–160ms, ease-out fuerte (DESIGN.md §6).
- [ ] `prefers-reduced-motion`: crossfade/instantáneo, glow estático.

### D6 — Responsive + móvil (cerrar el wart)
- [ ] **Bug conocido:** en móvil las etiquetas de ronda se repiten por mitad (izq/der).
      Decidir: agrupar por ronda real (16avos únicos) o separadores "zona alta/baja".
- [ ] Scroll/zoom desktop pulido; el ajuste-a-ancho no debe achicar texto bajo legibilidad.

### D7 — Estados, a11y, edge cases
- [ ] Contraste AA en nodo, placeholder, píldora (verificado).
- [ ] Foco visible navegable por el árbol; orden de tabulación lógico.
- [ ] Edge: nombres largos (BOSNIA Y HERZEGOVINA) sin romper el nodo.
- [ ] Simular resultado vivo (localStorage `polla:knockoutResults`) y validar realce de
      ganador + tinte de conector + desbloqueo de la ronda siguiente.

### D8 — Premium `/predicciones` (coherencia)
- [ ] Mismo lenguaje de nodo en las cartas de captura (estados + ícono), inputs y AVANZA.
- [ ] Mantener intacto el cliente de persistencia (`predicciones.knockout.client.js`).

---

## 4. Entregables visuales (gates de aprobación)

Antes de "listo", capturar y revisar:
- `/fixture` desktop ancho (árbol completo) — screenshot.
- `/fixture` con un resultado simulado (ganador + conector teñido + desbloqueo).
- `/fixture` móvil (<1080px).
- `/predicciones` desktop + móvil.
Cada uno contra el **checklist DESIGN.md §9** (CTA único amarillo, AA, estados completos,
sin anti-patterns §7, números tabulares, motion <300ms, colapso móvil declarado).

---

## 5. Decisiones abiertas (pedir al usuario antes de ejecutar D1+)

1. **Código vs nombre en el nodo:** ¿RSA + bandera (compacto, broadcast) o Sudáfrica
   (legible, casual)? Hoy: nombre. *Recomendación: código en desktop, nombre en móvil.*
2. **Banderas vs escudos (crests):** hoy banderas. Escudos se ven más "premium" pero
   obligan a tocar los clientes de hidratación (`flagHtml` + payloads). ¿Vale el costo?
3. **Intensidad del centro:** ¿glow dorado sutil (actual) o ceremonia mayor (haz de luz,
   partículas estáticas, marco 3D)? Recordar dial Motion=3.
4. **Reveal de entrada:** ¿animación de aparición por etapas (sutil) o estático? (Motion=3.)
5. **Hero oscuro opcional:** DESIGN.md dice claro; ¿una franja/banner oscuro SOLO detrás del
   centro para destacar la Final, o todo claro? *Recomendación: todo claro, identidad manda.*

---

## 6. Criterio de éxito

La fase está lista cuando:
1. Cero violaciones DESIGN.md §7 en la llave (ghost-card resuelto, estado con ícono).
2. La llave se lee como **bracket premium de transmisión**, no como cajas con líneas.
3. El centro se siente **ceremonia** (Final destacada, trofeo, 3er puesto secundario).
4. Estados completos y a11y AA; motion con propósito <300ms + reduced-motion.
5. Móvil resuelto (sin etiquetas duplicadas), desktop ajustado sin perder legibilidad.
6. `npm test` y `npm run build` verdes; hidratación viva intacta (resultado simulado OK).

---

## 7. Orden de ataque sugerido
`D0 (compliance) → D5-hover + D1 (nodo) → D2 (conectores) → D3 (centro) → D6 (móvil) →
D7 (a11y/edge) → D8 (predicciones) → D4 (tipografía/densidad, pulido final) → D-gates`.
Build verde en cada salto; screenshot antes de cada aprobación.
