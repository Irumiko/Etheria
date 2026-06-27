-- ═══════════════════════════════════════════════════════════════════
-- cycle_views — Registro de qué usuarios han visto los Ecos del ciclo
-- Un registro por (cycle_id, user_id): no se duplican.
-- Idempotente: se puede re-ejecutar sin errores.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.cycle_views (
    id         uuid        primary key default gen_random_uuid(),
    cycle_id   uuid        not null references public.topic_cycles(id) on delete cascade,
    user_id    uuid        not null references auth.users(id)          on delete cascade,
    viewed_at  timestamptz not null default now(),
    unique (cycle_id, user_id)
);

create index if not exists idx_cycle_views_user
    on public.cycle_views (user_id);

alter table public.cycle_views enable row level security;

do $$ begin
    create policy "Users can read their own cycle_views"
        on public.cycle_views for select
        to authenticated
        using (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;

do $$ begin
    create policy "Users can insert their own cycle_views"
        on public.cycle_views for insert
        to authenticated
        with check (auth.uid() = user_id);
exception when duplicate_object then null;
end $$;
