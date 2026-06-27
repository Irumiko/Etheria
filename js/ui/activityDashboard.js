// ═══════════════════════════════════════════════════════════════════
// ACTIVITY DASHBOARD — Visualización del activity_log
//
// Muestra estadísticas de uso por historia: mensajes enviados,
// ciclos cerrados, elecciones lanzadas, rangos alcanzados y
// ramas de relación elegidas.
//
// Solo accesible para el creador de la historia (topic owner).
// Arquitectura: módulo IIFE, comunica via eventBus, sin imports directos.
// ═══════════════════════════════════════════════════════════════════

const ActivityDashboard = (function () {

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() { return window.supabaseClient || null; }
    function _esc(s)   { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    async function _fetchLogs(topicId, days = 30) {
        if (!_client() || !topicId) return [];
        const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

        const { data, error } = await _client()
            .from('activity_log')
            .select('action, entity_type, entity_id, metadata, created_at, user_id')
            .eq('entity_id', String(topicId))
            .gte('created_at', since)
            .order('created_at', { ascending: false });

        if (error) {
            window.EtheriaLogger?.warn('dashboard', error.message);
            return [];
        }
        return data || [];
    }

    // ── Análisis de logs ──────────────────────────────────────────────────────

    function _analyze(logs) {
        const counts = {
            message_sent:     0,
            cycle_closed:     0,
            choice_launched:  0,
            choice_responded: 0,
            affinity_changed: 0,
            rank_reached:     0,
            branch_chosen:    0,
        };

        const byDay    = {};  // { 'YYYY-MM-DD': { messages, cycles, choices } }
        const ranks    = {};  // { rankName: count }
        const branches = {};  // { branchType: count }
        const bilateral = []; // rangos bilaterales alcanzados

        logs.forEach(log => {
            const action = log.action;
            if (counts[action] !== undefined) counts[action]++;

            // Agrupar por día
            const day = log.created_at?.slice(0, 10);
            if (day) {
                if (!byDay[day]) byDay[day] = { messages: 0, cycles: 0, choices: 0 };
                if (action === 'message_sent')    byDay[day].messages++;
                if (action === 'cycle_closed')    byDay[day].cycles++;
                if (action === 'choice_launched') byDay[day].choices++;
            }

            // Rangos alcanzados
            if (action === 'rank_reached' && log.metadata?.rank) {
                const rank = log.metadata.rank;
                ranks[rank] = (ranks[rank] || 0) + 1;
                if (log.metadata.bilateral) bilateral.push(rank);
            }

            // Ramas elegidas
            if (action === 'branch_chosen' && log.metadata?.relationType) {
                const b = log.metadata.relationType;
                branches[b] = (branches[b] || 0) + 1;
            }
        });

        return { counts, byDay, ranks, branches, bilateral };
    }

    // ── Render ────────────────────────────────────────────────────────────────

    function _renderDashboard(topicId, logs) {
        const { counts, byDay, ranks, branches, bilateral } = _analyze(logs);

        // ── Métricas principales ──────────────────────────────────────────────
        const metricsHtml = [
            { label: 'Mensajes',   value: counts.message_sent,     icon: '✉' },
            { label: 'Ciclos',     value: counts.cycle_closed,     icon: '◎' },
            { label: 'Elecciones', value: counts.choice_launched,  icon: '✦' },
            { label: 'Respuestas', value: counts.choice_responded, icon: '↩' },
            { label: 'Hitos',      value: counts.rank_reached,     icon: '♦' },
        ].map(m => `
            <div class="adb-metric">
                <span class="adb-metric-icon">${m.icon}</span>
                <span class="adb-metric-val">${m.value}</span>
                <span class="adb-metric-label">${m.label}</span>
            </div>
        `).join('');

        // ── Actividad por día (últimos 14 días visibles) ──────────────────────
        const days = Object.keys(byDay).sort().slice(-14);
        const maxMsgs = Math.max(1, ...days.map(d => byDay[d]?.messages || 0));

        const barsHtml = days.length ? days.map(d => {
            const msgs = byDay[d]?.messages || 0;
            const pct  = Math.round((msgs / maxMsgs) * 100);
            const label = d.slice(5); // MM-DD
            return `
                <div class="adb-bar-col">
                    <div class="adb-bar-wrap">
                        <div class="adb-bar-fill" style="height:${pct}%" title="${msgs} mensajes el ${d}"></div>
                    </div>
                    <span class="adb-bar-label">${label}</span>
                </div>
            `;
        }).join('') : '<p class="adb-empty">Sin actividad en los últimos 30 días</p>';

        // ── Rangos más alcanzados ─────────────────────────────────────────────
        const topRanks = Object.entries(ranks)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const ranksHtml = topRanks.length ? topRanks.map(([name, count]) => `
            <div class="adb-rank-row">
                <span class="adb-rank-name">${_esc(name)}</span>
                <span class="adb-rank-count">${count}×</span>
            </div>
        `).join('') : '<p class="adb-empty">Sin hitos registrados</p>';

        // ── Ramas elegidas ────────────────────────────────────────────────────
        const BRANCH_LABELS = {
            friendship: '♦ Amistad',
            romance:    '♡ Romance',
            rivalry:    '⚔ Rivalidad',
            enmity:     '✗ Enemistad',
        };
        const branchesHtml = Object.keys(branches).length
            ? Object.entries(branches).map(([type, count]) => `
                <div class="adb-branch-row">
                    <span class="adb-branch-label">${_esc(BRANCH_LABELS[type] || type)}</span>
                    <span class="adb-branch-count">${count}</span>
                </div>
            `).join('')
            : '<p class="adb-empty">Sin ramas elegidas aún</p>';

        // ── Hitos bilaterales ─────────────────────────────────────────────────
        const bilateralHtml = bilateral.length
            ? `<p class="adb-bilateral-note">✦ ${bilateral.length} vínculo${bilateral.length > 1 ? 's' : ''} bilateral${bilateral.length > 1 ? 'es' : ''} alcanzado${bilateral.length > 1 ? 's' : ''}: ${bilateral.slice(0, 3).map(_esc).join(', ')}${bilateral.length > 3 ? '…' : ''}</p>`
            : '';

        return `
            <div class="adb-root">
                <div class="adb-header">
                    <span class="adb-title">✦ Actividad de la historia ✦</span>
                    <span class="adb-period">Últimos 30 días</span>
                </div>

                <div class="adb-metrics">${metricsHtml}</div>

                ${bilateralHtml}

                <div class="adb-section">
                    <span class="adb-section-label">Mensajes por día</span>
                    <div class="adb-bars">${barsHtml}</div>
                </div>

                <div class="adb-cols">
                    <div class="adb-col">
                        <span class="adb-section-label">Hitos de rango</span>
                        <div class="adb-ranks">${ranksHtml}</div>
                    </div>
                    <div class="adb-col">
                        <span class="adb-section-label">Ramas elegidas</span>
                        <div class="adb-branches">${branchesHtml}</div>
                    </div>
                </div>
            </div>
        `;
    }

    // ── API pública ───────────────────────────────────────────────────────────

    async function open(topicId) {
        const modal = document.getElementById('activityDashboardModal');
        const body  = document.getElementById('activityDashboardBody');
        if (!modal || !body) return;

        // Loading
        body.innerHTML = '<div class="adb-loading"><span class="adb-spinner"></span> Cargando actividad…</div>';
        modal.classList.remove('hidden');

        try {
            const logs = await _fetchLogs(topicId, 30);
            body.innerHTML = _renderDashboard(topicId, logs);
        } catch (err) {
            body.innerHTML = '<p class="adb-empty">Error cargando los datos.</p>';
            window.EtheriaLogger?.warn('dashboard', err?.message);
        }
    }

    function close() {
        document.getElementById('activityDashboardModal')?.classList.add('hidden');
    }

    return { open, close };

})();

window.ActivityDashboard = ActivityDashboard;
