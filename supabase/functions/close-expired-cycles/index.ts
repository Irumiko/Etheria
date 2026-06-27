// ================================================================
// ETHERIA — Edge Function: close-expired-cycles
// ================================================================
// Cierra todos los ciclos narrativos cuyo `closes_at` ya ha pasado
// y siguen con status = 'open'.
//
// Se invoca cada hora desde un job pg_cron (ver migrations/cron_close_cycles.sql).
// También puede invocarse manualmente con un POST autenticado.
//
// Flujo:
//   1. Busca todos los ciclos open con closes_at < NOW()
//   2. Los marca como closed (status='closed', closed_at=NOW())
//   3. Devuelve un resumen { closed: number, ids: string[] }
//
// Variables de entorno requeridas:
//   SUPABASE_URL              — inyectada automáticamente
//   SUPABASE_SERVICE_ROLE_KEY — inyectada automáticamente
//   CRON_SECRET               — secret para verificar la llamada del cron
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  // Solo POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verificar secret del cron para evitar invocaciones no autorizadas
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret) {
    const incoming = req.headers.get('x-cron-secret');
    if (incoming !== cronSecret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Service role para poder actualizar sin restricciones de RLS
  const supabase = createClient(supabaseUrl, serviceKey);

  const now = new Date().toISOString();

  // Buscar ciclos expirados
  const { data: expired, error: fetchError } = await supabase
    .from('topic_cycles')
    .select('id')
    .eq('status', 'open')
    .lt('closes_at', now);

  if (fetchError) {
    console.error('[close-cycles] Error buscando ciclos expirados:', fetchError.message);
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!expired || expired.length === 0) {
    console.log('[close-cycles] Sin ciclos expirados.');
    return new Response(
      JSON.stringify({ closed: 0, ids: [] }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  const expiredIds = expired.map((r: { id: string }) => r.id);

  // Cerrar todos de una vez
  const { error: updateError } = await supabase
    .from('topic_cycles')
    .update({ status: 'closed', closed_at: now })
    .in('id', expiredIds);

  if (updateError) {
    console.error('[close-cycles] Error cerrando ciclos:', updateError.message);
    return new Response(
      JSON.stringify({ error: updateError.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[close-cycles] Cerrados ${expiredIds.length} ciclo(s): ${expiredIds.join(', ')}`);

  return new Response(
    JSON.stringify({ closed: expiredIds.length, ids: expiredIds }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
