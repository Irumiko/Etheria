-- ═══════════════════════════════════════════════════════════════════
-- topic_cycles — Ciclos narrativos del modo clásico
-- Cada ciclo agrupa un turno de respuestas en una historia clásica.
-- Se cierra cuando todos los participantes han respondido o tras 72h.
-- Idempotente: se puede re-ejecutar sin errores.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.topic_cycles (
    id           uuid        primary key default gen_random_uuid(),
    topic_id     text        not null,
    started_at   timestamptz not null default now(),
    closes_at    timestamptz not null,
    closed_at    timestamptz,
    status       text        not null default 'open'
                             check (status in ('open', 'closed')),
    participants jsonb       not null default '[]'::jsonb
);

-- Índice para buscar el ciclo abierto de un tema eficientemente
create index if not exists idx_topic_cycles_topic_status
    on public.topic_cycles (topic_id, status);

-- RLS
alter table public.topic_cycles enable row level security;

do $$ begin
    create policy "Authenticated users can read topic_cycles"
        on public.topic_cycles for select
        to authenticated
        using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
    create policy "Authenticated users can insert topic_cycles"
        on public.topic_cycles for insert
        to authenticated
        with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
    create policy "Authenticated users can update topic_cycles"
        on public.topic_cycles for update
        to authenticated
        using (true);
exception when duplicate_object then null;
end $$;
