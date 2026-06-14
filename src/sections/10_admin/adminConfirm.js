// Pop-up de confirmacion accesible para acciones criticas del admin.
//
// El usuario pidio que SIEMPRE que haya un "Finalizar / editar / des-finalizar"
// resultado oficial aparezca una advertencia con confirmacion. Este helper crea un
// unico <dialog> (singleton, appendeado a <body>) y devuelve una Promesa<boolean>.
// Usa <form method="dialog"> para cerrar de forma nativa (Esc, boton) y resuelve
// segun returnValue. El backdrop tambien cancela.

let dialog = null;
let titleEl = null;
let messageEl = null;
let okEl = null;
let cancelEl = null;

function ensureStyles() {
  if (document.getElementById("admin-confirm-styles")) return;
  const style = document.createElement("style");
  style.id = "admin-confirm-styles";
  style.textContent = `
    .admin-confirm {
      width: min(28rem, calc(100vw - 2rem));
      padding: 0;
      border: 1px solid var(--pm-border-soft, rgba(7,26,53,.18));
      border-radius: var(--pm-radius-lg, 16px);
      background: var(--pm-white, #fff);
      color: var(--pm-blue-900, #0b2545);
      box-shadow: 0 24px 60px rgba(7,26,53,.35);
    }
    .admin-confirm::backdrop { background: rgba(7,26,53,.5); backdrop-filter: blur(2px); }
    .admin-confirm__card { display: flex; flex-direction: column; gap: .7rem; margin: 0; padding: 1.1rem 1.2rem; }
    .admin-confirm__icon {
      display: grid; place-items: center; width: 2.4rem; height: 2.4rem; border-radius: 999px;
      background: var(--pm-state-live-bg, #ffe1e6); color: var(--pm-state-live-text, #c81e3a);
      font-family: var(--font-display, sans-serif); font-size: 1.2rem; font-weight: 950;
    }
    .admin-confirm[data-tone="info"] .admin-confirm__icon { background: var(--pm-blue-100, #e3effb); color: var(--pm-blue-700, #1f5fa6); }
    .admin-confirm h2 { margin: 0; font-family: var(--font-display, sans-serif); font-size: 1rem; font-weight: 950; letter-spacing: .01em; }
    .admin-confirm p { margin: 0; font-size: .85rem; line-height: 1.4; color: var(--pm-text-soft, #4a5a72); }
    .admin-confirm__actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: .3rem; }
    .admin-confirm__actions button {
      min-height: 2.3rem; padding: .5rem .9rem; border-radius: var(--pm-radius-sm, 10px);
      font-family: var(--font-display, sans-serif); font-size: .74rem; font-weight: 950;
      letter-spacing: .03em; text-transform: uppercase; cursor: pointer;
    }
    .admin-confirm__cancel { border: 1px solid var(--pm-border-soft, rgba(7,26,53,.18)); background: var(--pm-white,#fff); color: var(--pm-blue-700,#1f5fa6); }
    .admin-confirm__ok { border: 1px solid var(--pm-pink-600, #d6246e); background: linear-gradient(135deg, var(--pm-pink-600,#d6246e), var(--pm-purple-500,#7c35ff)); color: #fff; }
    .admin-confirm[data-tone="info"] .admin-confirm__ok { border-color: var(--pm-mint-500,#21d99a); background: linear-gradient(135deg, var(--pm-mint-500,#21d99a), var(--pm-cyan-500,#18ddf2)); }
    .admin-confirm__actions button:focus-visible { outline: none; box-shadow: var(--pm-focus-ring, 0 0 0 3px rgba(24,221,242,.6)); }
  `;
  document.head.append(style);
}

function ensureDialog() {
  if (dialog) return dialog;
  ensureStyles();
  dialog = document.createElement("dialog");
  dialog.className = "admin-confirm";
  dialog.setAttribute("data-admin-confirm", "");
  dialog.innerHTML = `
    <form method="dialog" class="admin-confirm__card">
      <span class="admin-confirm__icon" aria-hidden="true">!</span>
      <h2 data-confirm-title></h2>
      <p data-confirm-message></p>
      <div class="admin-confirm__actions">
        <button type="submit" value="cancel" class="admin-confirm__cancel" data-confirm-cancel></button>
        <button type="submit" value="confirm" class="admin-confirm__ok" data-confirm-ok></button>
      </div>
    </form>`;
  document.body.append(dialog);
  titleEl = dialog.querySelector("[data-confirm-title]");
  messageEl = dialog.querySelector("[data-confirm-message]");
  okEl = dialog.querySelector("[data-confirm-ok]");
  cancelEl = dialog.querySelector("[data-confirm-cancel]");
  // Click en el backdrop cancela.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.returnValue = "cancel";
      dialog.close("cancel");
    }
  });
  return dialog;
}

/**
 * @returns {Promise<boolean>} true si el usuario confirma.
 */
export function confirmDialog({
  title = "Confirmar accion",
  message = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger",
} = {}) {
  const d = ensureDialog();
  titleEl.textContent = title;
  messageEl.textContent = message;
  okEl.textContent = confirmLabel;
  cancelEl.textContent = cancelLabel;
  d.dataset.tone = tone;
  d.returnValue = "cancel";

  return new Promise((resolve) => {
    const onClose = () => {
      d.removeEventListener("close", onClose);
      resolve(d.returnValue === "confirm");
    };
    d.addEventListener("close", onClose);
    if (typeof d.showModal === "function") d.showModal();
    else {
      // Fallback muy defensivo (navegadores sin <dialog>).
      d.setAttribute("open", "");
      resolve(window.confirm(`${title}\n\n${message}`));
    }
    // Foco inicial en Cancelar (accion segura por defecto).
    window.requestAnimationFrame(() => cancelEl?.focus());
  });
}
