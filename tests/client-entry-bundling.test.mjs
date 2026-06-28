import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// V2 ELIMINATORIAS: solo las secciones activas en la fase A. Cada una debe dejar que
// Astro/Vite empaquete su cliente (import "./x.client.js"), nunca publicarlo como ?url.
const clientEntries = [
  {
    section: "src/sections/04_predicciones/PrediccionesSection.astro",
    client: "./predicciones.knockout.client.js",
  },
  {
    section: "src/sections/07_fixture/FixtureSection.astro",
    client: "./fixture.bracket.client.js",
  },
  {
    section: "src/sections/08_equipos/EquiposSection.astro",
    client: "./equipos.client.js",
  },
  {
    section: "src/sections/11_podio/PodioSection.astro",
    client: "./podio.client.js",
  },
  {
    section: "src/sections/12_admin/AdminKnockoutSection.astro",
    client: "./admin.knockout.client.js",
  },
  {
    section: "src/sections/13_tabla/TablaKnockoutSection.astro",
    client: "./tabla.knockout.client.js",
  },
  {
    section: "src/sections/06_proximo_partido/ProximoSection.astro",
    client: "./proximo.knockout.client.js",
  },
  {
    section: "src/sections/09_estadisticas/EstadisticasSection.astro",
    client: "./estadisticas.knockout.client.js",
  },
];

test("empaqueta los clientes que importan modulos compartidos", async () => {
  for (const entry of clientEntries) {
    const source = await readFile(entry.section, "utf8");

    assert.doesNotMatch(
      source,
      new RegExp(`${entry.client.replaceAll(".", "\\.")}\\?url`),
      `${entry.section} no debe publicar el cliente como un asset crudo`,
    );
    assert.match(
      source,
      new RegExp(`import\\s+["']${entry.client.replaceAll(".", "\\.")}["']`),
      `${entry.section} debe dejar que Astro/Vite empaquete el cliente`,
    );
  }
});
