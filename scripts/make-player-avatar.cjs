// Genera el avatar webp + thumb de un jugador, calzando la convención del proyecto:
//   full  -> public/assets/players/<id>.webp        (1086x1448, retrato 3:4, cover)
//   thumb -> public/assets/players/thumbs/<id>.webp (512x512, cuadrado, recorte a la cara)
//
// Uso:  node scripts/make-player-avatar.cjs <id> "<ruta-imagen-fuente>"
// Ej.:  node scripts/make-player-avatar.cjs martin "C:/Users/pablo/Desktop/martin.png"
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const [, , id, src] = process.argv;
if (!id || !src) {
  console.error('Uso: node scripts/make-player-avatar.cjs <id> "<ruta-imagen-fuente>"');
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error("No existe la imagen fuente:", src);
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const fullOut = path.join(root, "public", "assets", "players", `${id}.webp`);
const thumbOut = path.join(root, "public", "assets", "players", "thumbs", `${id}.webp`);
fs.mkdirSync(path.dirname(thumbOut), { recursive: true });

(async () => {
  // FULL: retrato 1086x1448, cover (rellena y recorta lo que sobre, sin deformar).
  await sharp(src)
    .resize(1086, 1448, { fit: "cover", position: "attention" })
    .webp({ quality: 86 })
    .toFile(fullOut);

  // THUMB: 512x512, cover recortando desde ARRIBA (retrato cabeza-torso => asegura la cara,
  // que está en el tercio superior; "attention" tiende a centrarse en el pecho colorido).
  await sharp(src)
    .resize(512, 512, { fit: "cover", position: "top" })
    .webp({ quality: 82 })
    .toFile(thumbOut);

  const fm = await sharp(fullOut).metadata();
  const tm = await sharp(thumbOut).metadata();
  console.log(`OK full : ${path.relative(root, fullOut)}  ${fm.width}x${fm.height}`);
  console.log(`OK thumb: ${path.relative(root, thumbOut)}  ${tm.width}x${tm.height}`);
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
