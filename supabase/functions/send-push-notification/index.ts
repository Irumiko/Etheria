// ================================================================
// ETHERIA — Edge Function: send-push-notification
// ================================================================
// Se invoca desde un Database Webhook cuando se inserta una fila
// en public.turn_notifications.
//
// Flujo:
//   1. Recibe el payload del webhook (nueva turn_notification)
//   2. Busca todas las push_subscriptions del recipient
//   3. Envía una notificación Web Push a cada dispositivo
//   4. Actualiza last_used_at y limpia endpoints caducados (410)
//
// Variables de entorno requeridas en Supabase Dashboard:
//   VAPID_PUBLIC_KEY   — clave pública VAPID (base64url)
//   VAPID_PRIVATE_KEY  — clave privada VAPID (base64url)
//   VAPID_SUBJECT      — mailto: o URL del sitio
//   SUPABASE_URL       — inyectada automáticamente por Supabase
//   SUPABASE_SERVICE_ROLE_KEY — inyectada automáticamente
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Tipos ─────────────────────────────────────────────────────────
interface TurnNotificationRow {
  id: string;
  recipient_user_id: string;
  sender_user_id: string;
  story_id: string | null;
  topic_id: string | null;
  title: string;
  body: string;
  meta: Record<string, unknown>;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: TurnNotificationRow;
  schema: string;
}

interface PushSubscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// ── Helpers VAPID / Web Push ───────────────────────────────────────

function base64urlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function importVapidPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  const keyBytes = base64urlToUint8Array(privateKeyB64);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function buildVapidHeaders(
  endpoint: string,
  vapidPublic: string,
  vapidPrivate: string,
  vapidSubject: string
): Promise<Record<string, string>> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 3600; // 12h

  // JWT header + payload
  const header = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  );
  const payload = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify({ aud: audience, exp: expiry, sub: vapidSubject }))
  );
  const signingInput = `${header}.${payload}`;

  const privateKey = await importVapidPrivateKey(vapidPrivate);
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(signingInput)
    )
  );
  const signature = uint8ArrayToBase64url(signatureBytes);
  const jwt = `${signingInput}.${signature}`;

  return {
    Authorization: `vapid t=${jwt},k=${vapidPublic}`,
    TTL: '86400',
  };
}

async function encryptPushPayload(
  payload: string,
  p256dhB64: string,
  authB64: string
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  // Implementación RFC 8291 (Web Push Encryption)
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(payload);

  // Importar clave pública del suscriptor
  const receiverPublicKey = await crypto.subtle.importKey(
    'raw',
    base64urlToUint8Array(p256dhB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Generar par de claves efímeras del servidor
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const senderPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', senderKeyPair.publicKey)
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: receiverPublicKey },
      senderKeyPair.privateKey,
      256
    )
  );

  // Salt aleatorio de 16 bytes
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authSecret = base64urlToUint8Array(authB64);

  // HKDF para derivar clave de contenido y nonce (RFC 8291)
  const prk = await hkdf(sharedSecret, authSecret,
    concat(encoder.encode('WebPush: info\x00'), base64urlToUint8Array(p256dhB64), senderPublicKeyRaw),
    32
  );
  const contentKey = await hkdf(prk, salt,
    encoder.encode('Content-Encoding: aes128gcm\x00'),
    16
  );
  const nonce = await hkdf(prk, salt,
    encoder.encode('Content-Encoding: nonce\x00'),
    12
  );

  // Importar clave AES-GCM y cifrar
  const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // Padding: 1 byte de separador (0x02) + plaintext
  const padded = new Uint8Array(plaintext.length + 1);
  padded[0] = 0x02;
  padded.set(plaintext, 1);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)
  );

  // Cabecera del registro (RFC 8291 §2.1)
  const recordHeader = new Uint8Array(21 + senderPublicKeyRaw.length);
  recordHeader.set(salt, 0);                                   // salt (16)
  new DataView(recordHeader.buffer).setUint32(16, 4096, false); // rs = 4096
  recordHeader[20] = senderPublicKeyRaw.length;                // keyid length
  recordHeader.set(senderPublicKeyRaw, 21);                    // sender pubkey

  const body = concat(recordHeader, ciphertext);

  return {
    body,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(body.length),
    },
  };
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    keyMaterial,
    length * 8
  );
  return new Uint8Array(bits);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) { result.set(arr, offset); offset += arr.length; }
  return result;
}

// ── Handler principal ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Solo POST desde el webhook de Supabase
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // Verificar secret del webhook (header X-Webhook-Secret)
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
  if (webhookSecret) {
    const incoming = req.headers.get('x-webhook-secret');
    if (incoming !== webhookSecret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Solo procesar inserciones en turn_notifications
  if (payload.type !== 'INSERT' || payload.table !== 'turn_notifications') {
    return new Response('Ignored', { status: 200 });
  }

  const notification = payload.record;
  const recipientId = notification.recipient_user_id;

  // Variables de entorno
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!;
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@etheria.app';

  if (!vapidPublic || !vapidPrivate) {
    console.error('[push] Faltan variables VAPID');
    return new Response('VAPID not configured', { status: 500 });
  }

  // Cliente Supabase con service role para leer suscripciones
  const supabase = createClient(supabaseUrl, serviceKey);

  // Buscar todas las suscripciones activas del destinatario
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', recipientId);

  if (error || !subscriptions?.length) {
    console.log(`[push] Sin suscripciones para ${recipientId}`);
    return new Response('No subscriptions', { status: 200 });
  }

  // Payload de la notificación (lo que verá el navegador)
  const notifPayload = JSON.stringify({
    title: notification.title || 'Etheria',
    body: notification.body || 'Te toca responder',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/icon-192.png',
    tag: `turn-${notification.story_id ?? notification.topic_id ?? 'general'}`,
    renotify: true,
    data: {
      topicId: notification.topic_id,
      storyId: notification.story_id,
      notificationId: notification.id,
      url: '/',
    },
  });

  const staleIds: string[] = [];

  // Enviar a cada dispositivo suscrito
  await Promise.allSettled(
    (subscriptions as PushSubscription[]).map(async (sub) => {
      try {
        const vapidHeaders = await buildVapidHeaders(
          sub.endpoint, vapidPublic, vapidPrivate, vapidSubject
        );
        const { body, headers: encHeaders } = await encryptPushPayload(
          notifPayload, sub.p256dh, sub.auth_key
        );

        const res = await fetch(sub.endpoint, {
          method: 'POST',
          headers: { ...vapidHeaders, ...encHeaders },
          body,
        });

        if (res.status === 410 || res.status === 404) {
          // Suscripción caducada — marcar para limpiar
          staleIds.push(sub.id);
        } else if (!res.ok) {
          console.warn(`[push] Endpoint ${sub.endpoint} devolvió ${res.status}`);
        } else {
          // Actualizar last_used_at
          await supabase
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id);
        }
      } catch (err) {
        console.error(`[push] Error enviando a ${sub.endpoint}:`, err);
      }
    })
  );

  // Limpiar suscripciones caducadas
  if (staleIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
    console.log(`[push] Limpiadas ${staleIds.length} suscripciones caducadas`);
  }

  return new Response(
    JSON.stringify({ sent: subscriptions.length - staleIds.length, cleaned: staleIds.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
