-- ═══════════════════════════════════════════════════════════════════
-- cron_close_cycles — Programa el cierre automático de ciclos expirados
--
-- Requiere: pg_cron y pg_net habilitados en el proyecto de Supabase.
-- Para habilitarlos: Dashboard → Database → Extensions → pg_cron / pg_net
--
-- Invoca la Edge Function close-expired-cycles cada hora.
-- El CRON_SECRET debe coincidir con el configurado en la Edge Function
-- (Dashboard → Edge Functions → close-expired-cycles → Secrets).
-- ═══════════════════════════════════════════════════════════════════

-- Habilitar extensiones si no están activas
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Eliminar job anterior si existía (idempotente)
select cron.unschedule('close-expired-cycles')
where exists (
    select 1 from cron.job where jobname = 'close-expired-cycles'
);

-- Programar el cierre cada hora en punto
-- Reemplaza <PROJECT_REF> con tu referencia de proyecto Supabase
-- Reemplaza <CRON_SECRET> con el valor del secret CRON_SECRET
select cron.schedule(
    'close-expired-cycles',
    '0 * * * *',   -- cada hora en punto
    $$
    select net.http_post(
        url     := 'https://timtqdrfeuzwwixfnudj.supabase.co/functions/v1/close-expired-cycles',
        headers := jsonb_build_object(
            'Content-Type',   'application/json',
            'x-cron-secret',  '<CRON_SECRET>'
        ),
        body    := '{}'::jsonb
    )
    $$
);
