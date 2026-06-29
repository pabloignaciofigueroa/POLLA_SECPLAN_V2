-- ============================================================================
-- Permite que el ADMIN escriba los RESULTADOS oficiales desde la web (publishable key).
-- Sin esto, /admin solo guarda en localStorage y los resultados NO se ven en otros
-- dispositivos. Con esto, el marcador EN VIVO / FINALIZADO se propaga a Supabase y todos
-- lo ven (incógnito, otros celulares, etc.).
--
-- Trade-off (juego de oficina, sin datos sensibles): la escritura de knockout_results queda
-- ABIERTA a la publishable key (anon). La UI de /admin es el unico lugar que escribe; el resto
-- de la web y las otras tablas siguen SOLO lectura. Si en el futuro se quiere blindar, se mueve
-- a una Edge Function que valide la clave de admin del lado servidor.
--
-- Correr UNA vez en el SQL Editor de Supabase. Idempotente.
-- ============================================================================

drop policy if exists knockout_results_write on public.knockout_results;
create policy knockout_results_write on public.knockout_results
  for all to anon, authenticated using (true) with check (true);

grant insert, update, delete on public.knockout_results to anon, authenticated;
