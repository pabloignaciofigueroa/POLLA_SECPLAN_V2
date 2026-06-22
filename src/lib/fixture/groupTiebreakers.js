// Cadena de desempate de grupo (DEFINICION SIMULTANEA, F2b).
//
// FUENTE UNICA: la cadena PTS > DG > GF > head-to-head(pts,DG,GF entre empatados) >
// indice original estable ya vive, correcta y pura, en
// `04_predicciones/predicciones.standings.js` (compareRows + directStats). Este modulo
// es una FACADE: re-exporta esas funciones (para test directo) y agrega un resolver
// provisional-aware. NO reimplementa la cadena (evita divergencia con la tabla de
// predicciones). compareRows/directStats reciben groupMatches+predictions como args y
// no cierran sobre estructuras de prediccion: son puras.
//
// `resolveFirstSecond` es el resolver PROVISIONAL (sirve con grupos abiertos, devuelve
// el top-2 con lo que haya). `getAutomaticQualified` (en predicciones.standings.js)
// sigue siendo el resolver OFICIAL, gateado por isComplete.

import {
  compareRows,
  directStats,
} from "../../sections/04_predicciones/predicciones.standings.js";

export { compareRows, directStats };

/** Alias semantico para uso fuera del motor de predicciones. */
export const compareGroupRows = compareRows;

/**
 * 1o/2o segun el orden ya desempatado del standingsResult (provisional-aware).
 * @param {{ standings?: Array<{teamId:string}> }} standingsResult
 * @returns {{ first: string|null, second: string|null }}
 */
export function resolveFirstSecond(standingsResult) {
  const standings = standingsResult?.standings ?? [];
  return {
    first: standings[0]?.teamId ?? null,
    second: standings[1]?.teamId ?? null,
  };
}
