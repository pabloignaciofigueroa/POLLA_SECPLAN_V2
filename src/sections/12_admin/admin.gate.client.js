// Candado básico de Admin (modo local / juego interno). Scoped a [data-section="admin"].
// La contraseña NUNCA se guarda ni se hardcodea: se compara el hash SHA-256 del input contra
// PUBLIC_ADMIN_PASSWORD_HASH (definido en .env.local, que está en .gitignore). La sesión
// desbloqueada vive en sessionStorage (no localStorage): al cerrar el navegador, se re-bloquea.
// Nota: es un candado de UI para uso local, no seguridad server-side.
const KEY = "polla:adminUnlocked";
const EXPECTED = String(import.meta.env.PUBLIC_ADMIN_PASSWORD_HASH || "").trim().toLowerCase();

(() => {
  const section = document.querySelector('[data-section="admin"]');
  if (!section) return;
  const gate = section.querySelector("[data-admin-gate]");
  const panel = section.querySelector("[data-admin-panel]");
  const form = section.querySelector("[data-admin-gate-form]");
  const input = section.querySelector("[data-admin-pass]");
  const errorEl = section.querySelector("[data-admin-error]");
  const logout = section.querySelector("[data-admin-logout]");
  if (!gate || !panel) return;

  const reveal = () => { gate.hidden = true; panel.hidden = false; };
  const lock = () => {
    try { sessionStorage.removeItem(KEY); } catch {}
    panel.hidden = true;
    gate.hidden = false;
    if (errorEl) errorEl.hidden = true;
    if (input) { input.value = ""; input.focus(); }
  };
  const showError = (msg) => { if (errorEl) { errorEl.textContent = msg; errorEl.hidden = false; } };

  // Ya validado en esta sesión.
  try { if (sessionStorage.getItem(KEY) === "true") reveal(); } catch {}

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (errorEl) errorEl.hidden = true;
      if (!EXPECTED) { showError("Admin sin configurar: define PUBLIC_ADMIN_PASSWORD_HASH en .env.local."); return; }
      const val = input ? input.value : "";
      if (!val) return;
      if (!(window.crypto && window.crypto.subtle)) { showError("Tu navegador no permite el desbloqueo (contexto no seguro)."); return; }
      let hex = "";
      try { hex = (await sha256Hex(val)).toLowerCase(); } catch { showError("No se pudo validar la contraseña."); return; }
      if (hex === EXPECTED) {
        try { sessionStorage.setItem(KEY, "true"); } catch {}
        reveal();
      } else {
        showError("Contraseña incorrecta.");
        if (input) { input.value = ""; input.focus(); }
      }
    });
  }

  if (logout) logout.addEventListener("click", () => lock());
})();
