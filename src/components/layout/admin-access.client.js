const ADMIN_PASSWORD = "Oli_oli_2026";
const ADMIN_SESSION_KEY = "polla:adminAccessGranted";
const ADMIN_SESSION_AT_KEY = "polla:adminAccessGrantedAt";
const ADMIN_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

function safeSessionGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {}
}

function safeSessionRemove(key) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}

function clearAdminSession() {
  safeSessionRemove(ADMIN_SESSION_KEY);
  safeSessionRemove(ADMIN_SESSION_AT_KEY);
}

function hasValidAdminSession() {
  const granted = safeSessionGet(ADMIN_SESSION_KEY);
  const grantedAt = Number(safeSessionGet(ADMIN_SESSION_AT_KEY));

  if (granted !== "true" || !grantedAt) return false;

  if (Date.now() - grantedAt > ADMIN_SESSION_DURATION_MS) {
    clearAdminSession();
    return false;
  }

  return true;
}

function grantAdminSession() {
  safeSessionSet(ADMIN_SESSION_KEY, "true");
  safeSessionSet(ADMIN_SESSION_AT_KEY, String(Date.now()));
}

window.PollaAdminAccess = {
  hasValidAdminSession,
  clearAdminSession,
};

const modal = document.querySelector("[data-admin-access-modal]");
const form = modal?.querySelector("[data-admin-access-form]");
const input = modal?.querySelector("[data-admin-access-input]");
const error = modal?.querySelector("[data-admin-access-error]");
const closeButtons = document.querySelectorAll("[data-admin-access-close]");
const triggers = document.querySelectorAll("[data-admin-access-trigger]");
let lastFocusedElement = null;

function setErrorVisible(isVisible) {
  if (!error) return;
  error.hidden = !isVisible;
}

function openAdminModal() {
  if (!modal) return;

  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.hidden = false;
  setErrorVisible(false);
  if (input) input.value = "";

  window.setTimeout(() => {
    input?.focus();
  }, 0);
}

function closeAdminModal() {
  if (!modal) return;

  modal.hidden = true;
  setErrorVisible(false);
  if (input) input.value = "";
  lastFocusedElement?.focus?.();
  lastFocusedElement = null;
}

window.PollaAdminAccess.openModal = openAdminModal;
window.PollaAdminAccess.closeModal = closeAdminModal;

triggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();

    const mobileMenu = trigger.closest("[data-section='mobile-menu']");
    if (mobileMenu instanceof HTMLDetailsElement) {
      mobileMenu.open = false;
    }

    if (hasValidAdminSession()) {
      window.location.href = "/admin";
      return;
    }

    openAdminModal();
  });
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const value = input?.value ?? "";

  if (value === ADMIN_PASSWORD) {
    grantAdminSession();
    window.location.href = "/admin";
    return;
  }

  setErrorVisible(true);
  if (input) {
    input.value = "";
    input.focus();
  }
});

closeButtons.forEach((button) => {
  button.addEventListener("click", closeAdminModal);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal && !modal.hidden) {
    closeAdminModal();
  }
});
