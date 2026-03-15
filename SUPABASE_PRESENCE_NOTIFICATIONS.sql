-- ============================================================
-- ETHERIA — Presence + Notificaciones de turno (Realtime)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1) Tabla de notificaciones de turno
create table if not exists public.turn_notifications (
    id uuid primary key default gen_random_uuid(),
    story_id uuid null references public.stories(id) on delete cascade,
    topic_id text null,
    recipient_user_id uuid not null references auth.users(id) on delete cascade,
    sender_user_id uuid not null references auth.users(id) on delete cascade,
    message_id text null,
    title text not null default 'Te toca responder',
    body text not null default 'Hay un turno esperando tu respuesta.',
    meta jsonb not null default '{}'::jsonb,
    is_read boolean not null default false,
    read_at timestamptz null,
    created_at timestamptz not null default now(),
    constraint turn_notifications_sender_not_recipient check (sender_user_id <> recipient_user_id)
);

create index if not exists idx_turn_notifications_recipient_created
    on public.turn_notifications(recipient_user_id, created_at desc);

create index if not exists idx_turn_notifications_story_created
    on public.turn_notifications(story_id, created_at desc);

-- 2) RLS
alter table public.turn_notifications enable row level security;

-- Ver notificaciones propias (recibidas o enviadas)
drop policy if exists "Turn notifications select own" on public.turn_notifications;
create policy "Turn notifications select own"
on public.turn_notifications
for select
using (
    auth.uid() = recipient_user_id
    or auth.uid() = sender_user_id
);

-- Insertar notificaciones como emisor autenticado
-- (el cliente no puede suplantar sender_user_id)
drop policy if exists "Turn notifications insert sender" on public.turn_notifications;
create policy "Turn notifications insert sender"
on public.turn_notifications
for insert
with check (
    auth.uid() = sender_user_id
);

-- Marcar como leída solo si eres el destinatario
-- Nota: esta policy permite UPDATE del destinatario.
drop policy if exists "Turn notifications update recipient" on public.turn_notifications;
create policy "Turn notifications update recipient"
on public.turn_notifications
for update
using (auth.uid() = recipient_user_id)
with check (auth.uid() = recipient_user_id);

-- 3) Realtime para notificaciones
alter publication supabase_realtime add table public.turn_notifications;

-- ============================================================
-- Presence en Supabase Realtime no requiere tabla adicional:
-- usa canales con config.presence desde supabase-js.
-- ============================================================
