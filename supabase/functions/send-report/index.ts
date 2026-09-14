// Edge Function: send-report
// Recibe reportes de bugs/recomendaciones desde el cliente (incluido el
// capturador de errores fatales en index.html, que puede llamar aquí SIN
// que el resto de la app haya cargado). Guarda el reporte en la tabla
// bug_reports y envía un email a la admin vía Resend.
//
// Variables de entorno en Supabase Dashboard → Edge Functions → send-report → Secrets:
//   RESEND_API_KEY   API key de https://resend.com (cuenta gratuita)
//   ADMIN_EMAIL      email de la administradora que recibe los reportes
//
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY se inyectan automáticamente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Límites defensivos — esto es un endpoint público (verify_jwt permite la anon key)
const MAX_TEXT_LEN = 4000;
const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2 MB en base64

function truncate(s: unknown, max: number): string | null {
    if (typeof s !== 'string' || !s) return null;
    return s.length > max ? s.slice(0, max) + '…' : s;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
    }

    let body: {
        type?: string;
        message?: string;
        page?: string;
        section?: string;
        error_message?: string;
        error_stack?: string;
        user_agent?: string;
        app_version?: string;
        reporter_email?: string;
        screenshot_base64?: string; // data URL: "data:image/jpeg;base64,...."
    };
    try {
        body = await req.json();
    } catch {
        return new Response(JSON.stringify({ ok: false, error: 'JSON inválido' }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
        });
    }

    const type = body.type === 'recommendation' ? 'recommendation' : 'bug';
    const message       = truncate(body.message, MAX_TEXT_LEN);
    const page           = truncate(body.page, 500);
    const section         = truncate(body.section, 200);
    const errorMessage   = truncate(body.error_message, MAX_TEXT_LEN);
    const errorStack     = truncate(body.error_stack, MAX_TEXT_LEN);
    const userAgent       = truncate(body.user_agent, 500);
    const appVersion     = truncate(body.app_version, 50);
    const reporterEmail = truncate(body.reporter_email, 200);

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } }
    );

    // ── Subir captura de pantalla (si viene y no es demasiado grande) ────────
    let screenshotPath: string | null = null;
    let screenshotBytes: Uint8Array | null = null;
    let screenshotContentType = 'image/jpeg';

    if (typeof body.screenshot_base64 === 'string' && body.screenshot_base64.length <= MAX_SCREENSHOT_BYTES) {
        const match = body.screenshot_base64.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
            screenshotContentType = match[1];
            try {
                screenshotBytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
                const ext = screenshotContentType === 'image/png' ? 'png' : 'jpg';
                screenshotPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

                const { error: uploadError } = await supabase.storage
                    .from('bug-screenshots')
                    .upload(screenshotPath, screenshotBytes, { contentType: screenshotContentType });

                if (uploadError) {
                    console.error('[send-report] screenshot upload failed:', uploadError.message);
                    screenshotPath = null;
                }
            } catch (e) {
                console.error('[send-report] screenshot decode failed:', e);
                screenshotPath = null;
            }
        }
    }

    // ── Guardar en bug_reports ────────────────────────────────────────────────
    const { data: row, error: insertError } = await supabase
        .from('bug_reports')
        .insert({
            type,
            message,
            page,
            section,
            error_message: errorMessage,
            error_stack: errorStack,
            user_agent: userAgent,
            app_version: appVersion,
            reporter_email: reporterEmail,
            screenshot_path: screenshotPath,
        })
        .select('id')
        .single();

    if (insertError) {
        console.error('[send-report] insert failed:', insertError.message);
    }

    // ── Enviar email vía Resend ───────────────────────────────────────────────
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
    const ADMIN_EMAIL     = Deno.env.get('ADMIN_EMAIL') ?? '';
    let emailSent = false;

    if (RESEND_API_KEY && ADMIN_EMAIL) {
        const subject = type === 'bug'
            ? `🐞 Etheria — Error en ${section || page || 'la app'}`
            : `💡 Etheria — Nueva recomendación`;

        const rows = [
            ['Tipo', type === 'bug' ? 'Error' : 'Recomendación'],
            ['Página', page],
            ['Sección', section],
            ['Mensaje de error', errorMessage],
            ['Fecha', new Date().toISOString()],
            ['Navegador', userAgent],
            ['Versión app', appVersion],
            ['Email de quien reporta', reporterEmail],
        ].filter(([, v]) => v);

        const htmlRows = rows.map(([k, v]) => `<tr><td style="padding:4px 10px 4px 0;color:#888;white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${escapeHtml(String(v))}</td></tr>`).join('');

        const html = `
            <div style="font-family:system-ui,sans-serif;font-size:14px;color:#222;max-width:640px">
                ${message ? `<p style="white-space:pre-wrap;font-size:15px">${escapeHtml(message)}</p>` : ''}
                <table>${htmlRows}</table>
                ${errorStack ? `<pre style="background:#f5f5f5;padding:10px;border-radius:6px;overflow:auto;font-size:12px;white-space:pre-wrap">${escapeHtml(errorStack)}</pre>` : ''}
                ${row?.id ? `<p style="color:#999;font-size:12px">ID del reporte: ${row.id}</p>` : ''}
            </div>
        `;

        const payload: Record<string, unknown> = {
            from: 'Etheria <onboarding@resend.dev>',
            to: [ADMIN_EMAIL],
            subject,
            html,
        };

        if (screenshotBytes && screenshotPath) {
            payload.attachments = [{
                filename: `screenshot.${screenshotContentType === 'image/png' ? 'png' : 'jpg'}`,
                content: btoa(String.fromCharCode(...screenshotBytes)),
            }];
        }

        try {
            const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            emailSent = res.ok;
            if (!res.ok) {
                console.error('[send-report] Resend error:', res.status, await res.text());
            }
        } catch (e) {
            console.error('[send-report] Resend fetch failed:', e);
        }
    } else {
        console.warn('[send-report] RESEND_API_KEY o ADMIN_EMAIL no configurados — email no enviado, reporte solo guardado en BD.');
    }

    if (row?.id && emailSent) {
        await supabase.from('bug_reports').update({ email_sent: true }).eq('id', row.id);
    }

    return new Response(JSON.stringify({ ok: true, saved: !insertError, email_sent: emailSent }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
});
