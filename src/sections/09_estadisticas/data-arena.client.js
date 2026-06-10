// Data Arena — flip de cartas jugables. Scoped a la seccion estadisticas.
// Las cartas son <button> renderizadas en SSR (Astro): el teclado (Enter/Espacio)
// ya dispara click de forma nativa. Aqui solo togglamos aria-pressed, que la CSS
// usa para girar la carta. Sin innerHTML, sin estado compartido.
(() => {
  const section = document.querySelector('[data-section="estadisticas"]');
  if (!section) return;
  const arena = section.querySelector("[data-data-arena]");
  if (!arena) return;

  arena.addEventListener("click", (event) => {
    const card = event.target instanceof Element ? event.target.closest("[data-flip-card]") : null;
    if (!card || !arena.contains(card)) return;
    const pressed = card.getAttribute("aria-pressed") === "true";
    card.setAttribute("aria-pressed", pressed ? "false" : "true");
  });
})();
