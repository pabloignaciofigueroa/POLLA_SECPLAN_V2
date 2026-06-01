# Product

## Register

brand

> Registro **mixto**: la portada (`/`), `/reglas`, `/equipos` y `/proximo-partido`
> son **brand** (el diseño ES el producto: poster arcade, apertura emocional).
> Las herramientas `/predicciones`, `/tabla`, `/fixture`, `/estadisticas`,
> `/admin` son **product** (el diseño SIRVE a la tarea: densidad de datos,
> claridad, estados). El default del proyecto es `brand`; las páginas-herramienta
> se tratan con registro `product` por tarea.

## Users

Empleados y comunidad de SECPLAN que arman una "polla" (quiniela) del Mundial
2026. Adultos no necesariamente fanáticos del diseño ni del fútbol técnico;
entran desde el celular durante el día y desde desktop en casa. Quieren:
predecir resultados de la fase de grupos y eliminatorias, competir contra
colegas en una tabla de posiciones, y seguir el avance del torneo. Contexto de
uso: ratos cortos, alternando móvil y desktop, con picos de actividad antes de
cada jornada. La motivación es social y competitiva (presumir el primer puesto),
no analítica.

## Product Purpose

Convertir el Mundial 2026 en un juego social interno: cada persona predice
marcadores, gana puntos por aciertos y escala una tabla compartida. La portada
existe para convertir al visitante en jugador (CTA "JUGAR"). El éxito se mide en
que la gente complete sus predicciones a tiempo y vuelva a revisar su posición.
Es un producto de temporada, festivo, con tensión deportiva y recompensa visible.

## Brand Personality

Tres palabras: **arcade, festivo, competitivo**. Voz directa y enérgica en
español rioplatense/neutro, en mayúsculas para los gritos de marca ("JUGAR",
"48 SELECCIONES") y en frase normal para instrucciones. Emoción objetivo:
adrenalina de cancha + coleccionismo de stickers del álbum mundialista +
claridad de un buen marcador electrónico. Nunca corporativo, nunca sobrio-fintech.

## Anti-references

- **No** SaaS-cream / beige editorial / "premium artesanal" (la identidad es
  saturada y luminosa a propósito, no tierra-neutra).
- **No** dark-glass-fintech morado-azul genérico de IA.
- **No** brutalismo crudo monoespaciado ni minimalismo gris de productividad:
  matarían la energía de juego.
- **No** look de casa de apuestas adulta (verde fieltro, dorados pesados, ruleta);
  esto es una polla amistosa entre colegas, festiva y limpia.
- **No** plantilla de torneo deportivo corporativa (azules sobrios + fotos stock).

## Design Principles

1. **La primera acción manda.** Cada página tiene una tarea principal evidente;
   el CTA rey (placa amarilla) nunca compite con decoración.
2. **El marcador es sagrado.** Números, posiciones y estados se leen al instante;
   tipografía de marcador y contraste alto antes que adorno.
3. **Color con significado, no con ruido.** La paleta arcade es amplia pero cada
   color codifica algo (sección, grupo, estado). Nada de arcoíris gratuito.
4. **Festivo pero legible.** La energía vive en acento, tipografía e ilustración;
   el cuerpo de texto y los datos siempre pasan contraste AA.
5. **Coleccionable.** Banderas, escudos, copa y podio se sienten como piezas de
   álbum; el detalle premia mirar de cerca.

## Accessibility & Inclusion

- WCAG 2.1 AA como piso: cuerpo ≥4.5:1, texto grande ≥3:1, placeholders 4.5:1.
- `prefers-reduced-motion` ya respetado globalmente
  ([accessibility.css](src/styles/accessibility.css)); toda animación nueva debe
  tener alternativa sin movimiento de posición/transform.
- `:focus-visible` visible con anillo cian/amarillo (tokens `--pm-focus-ring*`).
- No depender solo del color para estados (acierto/error/bloqueo): acompañar con
  ícono o texto, dado que la paleta usa color como código.

---

_Generado por el design-run (impeccable `init`) — supuestos inferidos del README,
[tokens.css](src/styles/tokens.css) y los `*.map.md` de cada sección; el README
raíz está desactualizado (declara "wireframe Fase 1" pero el código va por
Fase 6/10/11 con arcade y assets WebP aplicados)._
