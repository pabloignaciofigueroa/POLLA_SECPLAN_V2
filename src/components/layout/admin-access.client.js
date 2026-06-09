import {
  clearAdminSession,
  hasValidAdminSession,
  loginAdmin,
} from "../../lib/liveMatch/liveMatchState.js";

window.PollaAdminAccess = {
  hasValidAdminSession,
  clearAdminSession,
};

const modal = document.querySelector("[data-admin-access-modal]");
const form = modal?.querySelector("[data-admin-access-form]");
const input = modal?.querySelector("[data-admin-access-input]");
const error = modal?.querySelector("[data-admin-access-error]");
const submit = form?.querySelector('button[type="submit"]');
const closeButtons = document.querySelectorAll("[data-admin-access-close]");
const triggers = document.querySelectorAll("[data-admin-access-trigger]");
let lastFocusedElement = null;

function setErrorVisible(isVisible) {
  if (!error) return;
  error.hidden = !isVisible;
}

function openAdminModal() {
  if (!modal) return;

  lastFocusedElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const value = input?.value ?? "";
  if (!value || submit?.disabled) return;

  if (submit) {
    submit.disabled = true;
    submit.dataset.originalLabel ||= submit.textContent || "Entrar al Admin";
    submit.textContent = "Validando...";
  }
  setErrorVisible(false);

  try {
    await loginAdmin(value);
    window.location.href = "/admin";
  } catch {
    setErrorVisible(true);
    if (input) {
      input.value = "";
      input.focus();
    }
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent =
        submit.dataset.originalLabel || "Entrar al Admin";
    }
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
