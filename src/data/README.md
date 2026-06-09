# Data - Polla Mundialera SECPLAN 2026 Clean V2

Esta carpeta reune los contratos locales que alimentan la version limpia de produccion.

Archivos productivos:

- `players.json` - listado de jugadores para `03_jugador`
- `teams.json` - informacion base por seleccion para fixture, grupos y `08_equipos`
- `fixture.json` - 72 partidos normalizados de fase de grupos
- `groups.json` - 12 grupos A...L derivados del fixture
- `predictions.json` - dataset canonico de cartones oficiales, generado por importador
- `results.json` - resultados oficiales limpios iniciales
- `scoring-rules.json` - reglas de puntaje para calculo de tabla
- `match-h2h-fifa-wikipedia.json` - fixture FIFA + historial H2H Wikipedia validado
- `admin-dashboard.json` - estado administrativo limpio inicial

Archivos `.mock.json`:

- Se conservan solo como referencia historica de wireframe.
- No deben importarse desde secciones productivas.
- No deben alimentar ranking, proximo partido, fixture ni admin.

## Reglas

- FIFA manda para fixture, horario, sede, grupo, estado y resultado oficial.
- Wikipedia solo se usa para antecedentes historicos H2H.
- No inventar resultados, favoritos, probabilidades, rachas, arbitros, clima ni estadisticas visibles.
- Si no hay backend, usar archivos limpios y estados vacios.
- Los archivos `predicciones_<jugador>_<fecha>.json` de la raiz se incorporan con
  `npm run predictions:build`. El comando valida los 72 partidos, los 24
  clasificados, la identidad y la coherencia de las tablas antes de reemplazar
  `src/data/predictions.json` y `public/data/community-predictions.json`.
- Las metricas corales usan solo cartones confirmados como denominador. Los
  jugadores pendientes no cuentan como votos negativos.
- Una corrección autorizada conserva el esquema 1.0 y agrega
  `replacesChecksum`, `correctionGeneratedAt` y `correctionPlayerId`.
- Para incorporarla se reemplaza el archivo anterior del jugador; si ambos
  permanecen en la raíz, el importador rechaza el duplicado.
