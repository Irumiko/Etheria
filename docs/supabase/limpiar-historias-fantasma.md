# Limpiar historias fantasma en Supabase

Esta guía sirve cuando la app muestra una historia/sala que ya no debería existir, pero no sabes su UUID (`id`) o Supabase AI no te lo devuelve directamente.

## Prompt recomendado para Supabase AI

Copia y pega este texto en el asistente SQL de Supabase:

```text
Actúa como asistente de base de datos Postgres/Supabase. Necesito limpiar una historia fantasma de mi app Etheria.

Contexto:
- Las historias están en public.stories.
- Los mensajes asociados están en public.messages y se relacionan con stories por messages.story_id = stories.id.
- public.stories.id es uuid.
- public.stories.created_by apunta normalmente a auth.users.id.
- Quiero que primero me muestres candidatos y luego me des un SQL seguro para borrar el candidato elegido.

Haz lo siguiente:
1. Genera una consulta SELECT que liste las historias más recientes con:
   - s.id
   - s.title
   - s.created_at
   - s.created_by
   - u.email si existe
   - número de mensajes asociados
2. Ordena por s.created_at desc.
3. Limita el resultado a 50 filas.
4. Después genera un bloque SQL de borrado transaccional para borrar una historia concreta usando su id real, no un placeholder textual inválido.
5. El borrado debe eliminar primero public.messages donde story_id = '<ID_REAL>' y después public.stories donde id = '<ID_REAL>'.
6. Usa RETURNING para confirmar qué filas se borraron.
7. Si hay RLS o permisos que bloquean el borrado, explícame qué policy o permiso debo revisar, pero no desactives RLS sin avisarme.
```

## SQL para encontrar el UUID real

Si prefieres no usar el asistente, ejecuta esto en el SQL Editor de Supabase:

```sql
select
  s.id,
  s.title,
  s.created_at,
  s.created_by,
  u.email,
  count(m.id) as message_count
from public.stories s
left join auth.users u on u.id = s.created_by
left join public.messages m on m.story_id = s.id
group by s.id, s.title, s.created_at, s.created_by, u.email
order by s.created_at desc
limit 50;
```

Copia el valor de `id` de la historia que quieres borrar. Debe tener formato UUID, por ejemplo `3f6c2f96-0a1c-48f4-a9e8-3e8b0b2e7f81`.

## SQL para borrar una historia elegida

Sustituye `00000000-0000-0000-0000-000000000000` por el UUID real que encontraste:

```sql
begin;

with deleted_messages as (
  delete from public.messages
  where story_id = '00000000-0000-0000-0000-000000000000'
  returning id, story_id
),
deleted_story as (
  delete from public.stories
  where id = '00000000-0000-0000-0000-000000000000'
  returning id, title, created_at, created_by
)
select
  (select count(*) from deleted_messages) as deleted_messages_count,
  deleted_story.*
from deleted_story;

commit;
```

Si el resultado no devuelve ninguna fila de `deleted_story`, el UUID no existe en ese proyecto, estás usando otra instancia de Supabase, copiaste otro campo distinto de `id`, o una policy/RLS impide el borrado.

## Si `public.stories` devuelve 0 filas

Si el `select` anterior sale como `Success` pero muestra **0 rows**, entonces no existe ningún `story_id` en esa base de datos/proyecto. En ese caso, las historias que sigues viendo en Etheria no vienen de `public.stories`: están guardadas localmente en el navegador (`localStorage`) o estás mirando otro proyecto de Supabase distinto al que usa la app.

Para comprobarlo desde la app:

1. Abre Etheria en el navegador donde ves esas historias.
2. Abre DevTools → Console.
3. Ejecuta:

```js
EtheriaLocalStories.list()
```

Eso lista las historias locales con su `id` local, `storyId` de Supabase si existe, título, modo, creador y número de mensajes. Si `storyId` sale como `null`, esa historia nunca llegó a guardarse en `public.stories`.

Para borrar una historia local concreta, copia su `id` de la lista anterior y ejecuta:

```js
EtheriaLocalStories.deleteById('ID_LOCAL_DE_LA_HISTORIA')
```

También puedes borrar varias a la vez:

```js
EtheriaLocalStories.deleteById([
  'ID_LOCAL_1',
  'ID_LOCAL_2'
])
```

> Importante: aquí debes usar el `id` que devuelve `EtheriaLocalStories.list()`, no tu UID de usuario ni el placeholder `UUID_DE_LA_HISTORIA`.

Si quieres una limpieza total de los datos de cuenta del navegador, cierra sesión desde la app: el logout borra las claves locales de cuenta (`etheria_topics`, `etheria_messages_*`, personajes, diarios, favoritos, etc.) sin tocar preferencias visuales como tema o tamaño de fuente.

## Prompt para Supabase AI cuando no hay filas

Puedes decirle esto para que no siga buscando un UUID inexistente:

```text
La consulta sobre public.stories con mi UID no devuelve filas y public.stories tiene 0 rows. Eso significa que no hay story_id en esta base. Ayúdame a distinguir entre estas opciones: (1) estoy mirando otro proyecto de Supabase; (2) las historias que veo están en localStorage del navegador; (3) el guardado a public.stories está fallando. Dame SQL solo para verificar tablas/proyecto, y dame pasos de navegador para listar/borrar localStorage de Etheria usando EtheriaLocalStories.list() y EtheriaLocalStories.deleteById().
```
