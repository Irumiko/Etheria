// ============================================================
// Etheria — Story Export
// Exporta la historia activa como .txt o HTML imprimible.
// API: window.EtheriaExport.exportText() | .printHTML()
// ============================================================
(function (global) {
    'use strict';

    // ── Helpers ───────────────────────────────────────────────────────

    function _esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _fmtDate(iso, opts) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleString('es-ES', opts || {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (_) { return iso; }
    }

    function _slug(title) {
        return (title || 'historia')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .slice(0, 60);
    }

    function _download(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a   = document.createElement('a');
        a.href  = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function _topic() {
        if (!global.currentTopicId || !global.appData) return null;
        return (global.appData.topics || []).find(function (t) {
            return String(t.id) === String(global.currentTopicId);
        }) || null;
    }

    function _msgs() {
        if (!global.currentTopicId || !global.appData) return [];
        var raw = (global.appData.messages || {})[global.currentTopicId] || [];
        return raw.filter(function (m) { return !m.typing; });
    }

    function _toast(txt, type) {
        if (typeof showAutosave === 'function') showAutosave(txt, type || 'info');
    }

    // ── Exportar como texto plano ─────────────────────────────────────

    function exportText() {
        var topic = _topic();
        var msgs  = _msgs();
        if (!topic) { _toast('No hay historia activa para exportar', 'error'); return; }

        var BAR  = '═'.repeat(58);
        var thin = '─'.repeat(58);

        var lines = [
            BAR,
            '  ETHERIA — EXPORTACIÓN DE HISTORIA',
            BAR,
            'Título:     ' + (topic.title    || 'Sin título'),
            'Creada por: ' + (topic.createdBy || 'Desconocido'),
            'Mensajes:   ' + msgs.length,
            'Exportada:  ' + _fmtDate(new Date().toISOString()),
            BAR,
            ''
        ];

        msgs.forEach(function (m, i) {
            var who  = m.isNarrator ? 'NARRADOR' : (m.charName || 'Desconocido').toUpperCase();
            var when = _fmtDate(m.timestamp);
            var sep  = '─── ' + (i + 1) + ' ';
            lines.push(sep + thin.slice(sep.length));
            lines.push('  ' + who + (when ? '  ·  ' + when : ''));
            lines.push('');
            (m.text || '').split('\n').forEach(function (l) { lines.push('  ' + l); });
            lines.push('');
        });

        _download(
            new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }),
            'etheria-' + _slug(topic.title) + '.txt'
        );
        _toast('✓ Historia exportada como texto', 'saved');
    }

    // ── Exportar como HTML imprimible (→ PDF desde el navegador) ─────

    function printHTML() {
        var topic = _topic();
        var msgs  = _msgs();
        if (!topic) { _toast('No hay historia activa para exportar', 'error'); return; }

        var rows = msgs.map(function (m) {
            var who  = m.isNarrator ? 'Narrador' : _esc(m.charName || 'Desconocido');
            var when = _fmtDate(m.timestamp, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            var body = _esc(m.text || '').replace(/\n/g, '<br>');
            var cls  = m.isNarrator ? ' narrator' : '';
            return '<div class="msg' + cls + '">'
                + '<div class="meta"><span class="who">' + who + '</span>'
                + (when ? '<span class="when">' + when + '</span>' : '') + '</div>'
                + '<div class="body">' + body + '</div>'
                + '</div>';
        }).join('\n');

        var html = '<!DOCTYPE html>\n<html lang="es">\n<head>\n'
            + '<meta charset="UTF-8">\n'
            + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
            + '<title>' + _esc(topic.title || 'Historia') + ' — Etheria</title>\n'
            + '<style>\n'
            + '  *{box-sizing:border-box;margin:0;padding:0}\n'
            + '  body{font-family:Georgia,"Times New Roman",serif;max-width:720px;'
            +        'margin:48px auto;padding:0 24px;color:#1a1208;line-height:1.7;'
            +        'background:#fdfaf5}\n'
            + '  header{border-bottom:2px solid #c9a86c;padding-bottom:16px;margin-bottom:32px}\n'
            + '  h1{font-size:1.8rem;color:#2d1a06;margin-bottom:6px}\n'
            + '  .subtitle{font-size:.88rem;color:#7a6040}\n'
            + '  .msg{margin-bottom:20px;padding-bottom:20px;'
            +        'border-bottom:1px solid #ede4d2;break-inside:avoid}\n'
            + '  .msg:last-child{border-bottom:none}\n'
            + '  .meta{display:flex;justify-content:space-between;'
            +         'align-items:baseline;margin-bottom:6px}\n'
            + '  .who{font-weight:700;font-size:.88rem;color:#3a2010;'
            +        'text-transform:uppercase;letter-spacing:.05em}\n'
            + '  .when{font-size:.78rem;color:#a08060}\n'
            + '  .body{font-size:.97rem;color:#2a1e10}\n'
            + '  .narrator .who{font-style:italic;text-transform:none;color:#6a5030}\n'
            + '  .narrator .body{font-style:italic;color:#4a3820}\n'
            + '  footer{margin-top:40px;padding-top:16px;border-top:1px solid #c9a86c;'
            +          'font-size:.78rem;color:#a08060;text-align:center}\n'
            + '  @media print{\n'
            + '    body{margin:20px auto;background:#fff}\n'
            + '    .msg{break-inside:avoid}\n'
            + '  }\n'
            + '</style>\n</head>\n<body>\n'
            + '<header>\n'
            + '  <h1>' + _esc(topic.title || 'Sin título') + '</h1>\n'
            + '  <p class="subtitle">'
            +    'por ' + _esc(topic.createdBy || 'Desconocido')
            +    ' &nbsp;·&nbsp; ' + msgs.length + ' mensaje' + (msgs.length !== 1 ? 's' : '')
            +    ' &nbsp;·&nbsp; Exportada el ' + _fmtDate(new Date().toISOString(), { day: 'numeric', month: 'long', year: 'numeric' })
            +    '</p>\n'
            + '</header>\n'
            + rows + '\n'
            + '<footer>Exportado desde Etheria</footer>\n'
            + '</body>\n</html>';

        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var win  = global.open(url, '_blank');
        if (win) {
            win.addEventListener('load', function () { URL.revokeObjectURL(url); }, { once: true });
        } else {
            // Popup bloqueado → descargar como .html
            _download(blob, 'etheria-' + _slug(topic.title) + '.html');
        }
        _toast('✓ Abierto para imprimir / guardar como PDF', 'saved');
    }

    global.EtheriaExport = { exportText: exportText, printHTML: printHTML };

}(window));
