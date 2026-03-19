// ═══════════════════════════════════════════════════════════════════
// MESSAGE SEARCH — Búsqueda de texto en mensajes de una historia
// Usa el índice GIN full-text de Supabase (search_vector en messages)
// y también búsqueda local para modo offline.
// ═══════════════════════════════════════════════════════════════════

const MessageSearch = (function () {

    let _isOpen    = false;
    let _results   = [];
    let _debounce  = null;

    function _client() { return window.supabaseClient || null; }

    // ── Abrir/cerrar panel ───────────────────────────────────────────
    function toggle() {
        _isOpen ? close() : open();
    }

    function open() {
        _isOpen = true;
        const panel = document.getElementById('msgSearchPanel');
        if (!panel) return;
        panel.classList.add('active');
        const input = document.getElementById('msgSearchInput');
        if (input) { input.value = ''; input.focus(); }
        _results = [];
        _renderResults([]);
    }

    function close() {
        _isOpen = false;
        const panel = document.getElementById('msgSearchPanel');
        if (panel) panel.classList.remove('active');
    }

    // ── Búsqueda ─────────────────────────────────────────────────────
    function onInput(query) {
        clearTimeout(_debounce);
        if (!query.trim()) { _renderResults([]); return; }
        _debounce = setTimeout(() => search(query), 350);
    }

    async function search(query) {
        const q = query.trim();
        if (!q || !currentTopicId) return;

        // 1. Búsqueda en Supabase (full-text)
        let supabaseResults = [];
        if (_client()) {
            try {
                const topic = appData?.topics?.find(t => String(t.id) === String(currentTopicId));
                const storyId = topic?.storyId;
                if (storyId) {
                    const { data, error } = await _client()
                        .from('messages')
                        .select('id, author, content, created_at')
                        .eq('story_id', storyId)
                        .eq('is_deleted', false)
                        .textSearch('search_vector', q, { config: 'spanish' })
                        .order('created_at', { ascending: false })
                        .limit(30);
                    if (!error && data) supabaseResults = data;
                }
            } catch {}
        }

        // 2. Búsqueda local como fallback o complemento
        const msgs = getTopicMessages ? getTopicMessages(currentTopicId) : [];
        const lower = q.toLowerCase();
        const localResults = msgs
            .filter((m, idx) => {
                if (m.isNarrator && !m.text) return false;
                const text = (m.text || '').toLowerCase();
                const author = (m.author || '').toLowerCase();
                return text.includes(lower) || author.includes(lower);
            })
            .map((m, idx) => ({ ...m, _localIndex: msgs.indexOf(m) }))
            .slice(0, 30);

        // Combinar — preferir locales (tienen índice para navegar)
        _results = localResults.length > 0 ? localResults : supabaseResults.map(r => ({
            id: r.id, author: r.author, text: r.content,
        }));

        _renderResults(_results, q);
    }

    // ── Render de resultados ─────────────────────────────────────────
    function _renderResults(results, query = '') {
        const container = document.getElementById('msgSearchResults');
        if (!container) return;

        if (results.length === 0) {
            container.innerHTML = query
                ? '<div class="msg-search-empty">Sin resultados</div>'
                : '<div class="msg-search-empty">Escribe para buscar…</div>';
            return;
        }

        const lower = query.toLowerCase();
        container.innerHTML = results.map((r, i) => {
            const text = r.text || r.content || '';
            const author = r.author || 'Narrador';
            // Highlight
            const highlighted = escapeHtml(text.slice(0, 120))
                .replace(new RegExp(escapeHtml(lower), 'gi'),
                    m => `<mark class="msg-search-mark">${m}</mark>`);
            return `
            <div class="msg-search-result" onclick="MessageSearch.jumpTo(${i})">
                <div class="msg-search-author">${escapeHtml(author)}</div>
                <div class="msg-search-text">${highlighted}${text.length > 120 ? '…' : ''}</div>
            </div>`;
        }).join('');
    }

    // ── Navegar al mensaje ───────────────────────────────────────────
    function jumpTo(resultIndex) {
        const r = _results[resultIndex];
        if (!r) return;

        // Si tiene índice local, navegar directamente
        if (typeof r._localIndex === 'number') {
            if (typeof currentMessageIndex !== 'undefined') {
                currentMessageIndex = r._localIndex;
                if (typeof showCurrentMessage === 'function') showCurrentMessage('init');
            }
        }
        close();
    }

    // ── Init ─────────────────────────────────────────────────────────
    (function _init() {
        // Cerrar con Escape
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _isOpen) close();
        });
    })();

    return { toggle, open, close, onInput, jumpTo };

})();

window.MessageSearch = MessageSearch;
