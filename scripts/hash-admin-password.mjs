// Genera el hash SHA-256 de una contraseña para el candado de /admin.
// La clave NO se guarda en ningún archivo: solo imprime el hash, que pegás en
// .env.local como PUBLIC_ADMIN_PASSWORD_HASH (ese archivo está en .gitignore).
//
// Uso:
//   node scripts/hash-admin-password.mjs "tu-clave-secreta"
//
// Luego pegá la salida en site/.env.local:
//   PUBLIC_ADMIN_PASSWORD_HASH=<hash-impreso>
import { createHash } from "node:crypto";

const pass = process.argv[2];
if (!pass) {
  console.error('Uso: node scripts/hash-admin-password.mjs "tu-clave-secreta"');
  process.exit(1);
}
const hash = createHash("sha256").update(pass, "utf8").digest("hex");
console.log(hash);
