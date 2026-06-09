import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const clientEntries = [
  {
    section: "src/sections/04_predicciones/PrediccionesSection.astro",
    client: "./predicciones.client.js",
  },
  {
    section: "src/sections/06_proximo_partido/ProximoPartidoSection.astro",
    client: "./proximo-partido.client.js",
  },
  {
    section: "src/sections/07_fixture/FixtureSection.astro",
    client: "./fixture.client.js",
  },
  {
    section: "src/sections/08_equipos/EquiposSection.astro",
    client: "./equipos.client.js",
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
