// Conectores SVG + ajuste-a-ancho del arbol de la llave (/fixture). SOLO presentacion:
// no toca datos, localStorage ni los hooks de hidratacion. Mide las posiciones de los nodos
// (offsetLeft/Top, sin transform) y dibuja los elbows; luego escala el arbol para que la
// llave completa entre en el ancho disponible (sin scroll horizontal cuando es posible).
(() => {
  const tree = document.querySelector("[data-ko-tree]");
  if (!tree) return;
  const scroll = tree.closest(".ko-tree-scroll") || tree.parentElement;
  const svg = tree.querySelector(".ko-connectors");
  const SVGNS = "http://www.w3.org/2000/svg";
  const nodes = Array.from(tree.querySelectorAll("[data-ko-node]"));
  const byId = new Map(nodes.map((n) => [n.getAttribute("data-ko-node"), n]));

  const isMobile = () => window.matchMedia("(max-width: 700px)").matches;

  const box = (el) => ({
    left: el.offsetLeft,
    right: el.offsetLeft + el.offsetWidth,
    vmid: el.offsetTop + el.offsetHeight / 2,
  });

  const drawConnectors = () => {
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (isMobile()) return; // en columnas no hay conectores
    const W = tree.offsetWidth;
    const H = tree.offsetHeight;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));

    const elbow = (s, t, side, cls) => {
      const sx = side === "right" ? s.left : s.right;
      const tx = side === "right" ? t.right : t.left;
      const midX = (sx + tx) / 2;
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", `M ${sx} ${s.vmid} H ${midX} V ${t.vmid} H ${tx}`);
      if (cls) path.setAttribute("class", cls);
      svg.appendChild(path);
    };

    nodes.forEach((node) => {
      const side = node.getAttribute("data-ko-side");
      if (side === "center") return; // los centrales son destino, no origen
      const s = box(node);
      // Si el cruce ya tiene ganador, el tramo hacia el siguiente se pinta dorado (camino del campeón).
      const resolved = node.querySelector('.ko-row[data-winner="true"]') ? "ko-conn--win" : "";
      const win = node.getAttribute("data-ko-winnerto");
      if (win && byId.has(win)) elbow(s, box(byId.get(win)), side, resolved);
      const lose = node.getAttribute("data-ko-loserto");
      if (lose && byId.has(lose)) elbow(s, box(byId.get(lose)), side, "ko-conn--lose");
    });
  };

  const fit = () => {
    // Resetea para medir el tamaño natural.
    tree.style.transform = "none";
    if (scroll) scroll.style.height = "";
    if (isMobile()) {
      drawConnectors();
      return;
    }
    const natW = tree.offsetWidth;
    const natH = tree.offsetHeight;
    if (!natW || !natH || !scroll) {
      drawConnectors();
      return;
    }
    // Ajuste a la VENTANA completa: la llave entera (16avos -> Final) debe verse sin scroll
    // en desktop y tablet. Escala = min(ancho disponible, alto disponible hasta el borde inferior).
    const availW = scroll.clientWidth - 8;
    const top = scroll.getBoundingClientRect().top;
    // Reserva el alto de la franja HUD inferior (si existe) para que no quede tapada ni desborde.
    const hud = scroll.parentElement && scroll.parentElement.querySelector("[data-bottom-hud]");
    const hudReserve = hud ? hud.offsetHeight + 16 : 10;
    const availH = window.innerHeight - top - hudReserve - 4;
    const scale = Math.max(0.1, Math.min(1, availW / natW, availH / natH));
    tree.style.transformOrigin = "top left";
    // Centra horizontalmente el árbol escalado dentro del contenedor.
    const tx = Math.max(0, (scroll.clientWidth - natW * scale) / 2);
    tree.style.transform = `translate(${tx}px, 0) scale(${scale})`;
    // El contenedor reserva exactamente el alto escalado: nada de scroll vertical extra.
    scroll.style.height = Math.ceil(natH * scale) + "px";
    drawConnectors();
  };

  const schedule = () => requestAnimationFrame(() => requestAnimationFrame(fit));

  schedule();
  window.addEventListener("load", schedule);
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(schedule, 100);
  });
  // Fuentes/imágenes tardías pueden cambiar alturas: re-dibuja cuando terminen de cargar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule).catch(() => {});
})();
