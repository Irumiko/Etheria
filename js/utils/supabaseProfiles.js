// ============================================
// SUPABASE PROFILES — Perfiles globales
// ============================================
// Tabla `profiles`:
//   id             uuid  PK
//   name           text  UNIQUE
//   stats          jsonb
//   owner_user_id  uuid  → auth.users.id (null = perfil libre)
//   created_at     timestamp
//
// RLS: SELECT public / INSERT+UPDATE solo owner
// ============================================

const SupabaseProfiles = (function () {

    let _initDone = false;   // guard contra init() múltiple

    // ── Helpers internos ─────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    // supabase-js v2: userId solo disponible async via getUser().
    // Guardamos el último userId conocido en caché local para comparaciones síncronas.
    let _cachedUserId = null;

    async function _getCurrentUser() {
        const sb = _client();
        if (!sb) return null;
        try {
            const { data, error } = await sb.auth.getUser();
            if (error || !data?.user) return null;
            _cachedUserId = data.user.id;
            return data.user;
        } catch { return null; }
    }

    function _currentUserId() {
        return _cachedUserId;
    }

    function _isAvailable() {
        return !!_client();
    }

    function _ensureCloudProfilesKey() {
        if (typeof appData !== 'undefined' && !Array.isArray(appData.cloudProfiles)) {
            appData.cloudProfiles = [];
        }
    }

    // ── Perfiles ─────────────────────────────────────────────────────────────

    async function loadCloudProfiles() {
        if (!_isAvailable()) return [];
        _ensureCloudProfilesKey();
        try {
            const { data, error } = await _client()
                .from('profiles')
                .select('*')
                .order('name', { ascending: true });

            if (error) {
                console.error('[SupabaseProfiles] loadCloudProfiles:', error.message);
                return [];
            }
            appData.cloudProfiles = Array.isArray(data) ? data : [];
            window.dispatchEvent(new CustomEvent('etheria:cloud-profiles-loaded', {
                detail: { profiles: appData.cloudProfiles }
            }));
            return appData.cloudProfiles;
        } catch (err) {
            console.error('[SupabaseProfiles] loadCloudProfiles exception:', err);
            return [];
        }
    }

    async function createCloudProfile(name, stats = {}) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };

        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'Debes iniciar sesión para crear un perfil.' };

        const trimmedName = String(name || '').trim();
        if (!trimmedName) return { ok: false, error: 'El nombre del perfil no puede estar vacío.' };

        try {
            const { data, error } = await _client()
                .from('profiles')
                .insert({ name: trimmedName, stats: stats || {}, owner_user_id: user.id })
                .select()
                .single();

            if (error) {
                const isDup = error.code === '23505'
                    || (error.message || '').toLowerCase().includes('unique')
                    || (error.message || '').toLowerCase().includes('duplicate')
                    || (error.details || '').toLowerCase().includes('name');
                return { ok: false, error: isDup ? 'Ya existe un perfil con ese nombre.' : (error.message || 'Error al crear el perfil.') };
            }

            _ensureCloudProfilesKey();
            appData.cloudProfiles.push(data);
            appData.cloudProfiles.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            window.dispatchEvent(new CustomEvent('etheria:cloud-profile-created', { detail: { profile: data } }));
            return { ok: true, profile: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function updateCloudProfileStats(profileId, stats) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'No autenticado.' };
        try {
            const { data, error } = await _client()
                .from('profiles')
                .update({ stats })
                .eq('id', profileId)
                .eq('owner_user_id', user.id)
                .select()
                .single();
            if (error) return { ok: false, error: error.message };
            _ensureCloudProfilesKey();
            const idx = appData.cloudProfiles.findIndex(p => p.id === profileId);
            if (idx !== -1) appData.cloudProfiles[idx] = data;
            return { ok: true, profile: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function releaseCloudProfile(profileId) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'No autenticado.' };
        try {
            const { data, error } = await _client()
                .from('profiles')
                .update({ owner_user_id: null })
                .eq('id', profileId)
                .eq('owner_user_id', user.id)
                .select()
                .single();
            if (error) return { ok: false, error: error.message };
            _ensureCloudProfilesKey();
            const idx = appData.cloudProfiles.findIndex(p => p.id === profileId);
            if (idx !== -1) appData.cloudProfiles[idx] = data;
            return { ok: true, profile: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    // ── Helpers de estado ────────────────────────────────────────────────────

    function isProfileTaken(profile) {
        return profile != null
            && profile.owner_user_id !== null
            && profile.owner_user_id !== undefined;
    }

    function getProfileStatus(profile) {
        if (!isProfileTaken(profile)) return 'free';
        const uid = _currentUserId();
        if (uid && profile.owner_user_id === uid) return 'mine';
        return 'taken';
    }

    function getProfileStatusLabel(profile) {
        const s = getProfileStatus(profile);
        if (s === 'free') return 'Libre';
        if (s === 'mine') return 'Tu personaje';
        return 'Ocupado';
    }

    function getProfileStatusClass(profile) {
        return `profile-${getProfileStatus(profile)}`;
    }

    function getMyProfiles() {
        const uid = _currentUserId();
        if (!uid || !Array.isArray(appData?.cloudProfiles)) return [];
        return appData.cloudProfiles.filter(p => p.owner_user_id === uid);
    }

    function getFreeProfiles() {
        if (!Array.isArray(appData?.cloudProfiles)) return [];
        return appData.cloudProfiles.filter(p => !isProfileTaken(p));
    }

    // ── Render ───────────────────────────────────────────────────────────────

    function renderCloudProfileList(container, { onSelect, showStats = false } = {}) {
        if (!container) return;
        _ensureCloudProfilesKey();

        const profiles = appData.cloudProfiles;
        if (!profiles.length) {
            container.innerHTML = '<p class="cloud-profiles-empty">No hay perfiles globales aún.</p>';
            return;
        }

        container.innerHTML = profiles.map(p => {
            const status   = getProfileStatus(p);
            const label    = getProfileStatusLabel(p);
            const cssClass = getProfileStatusClass(p);
            const initial  = (p.name || '?')[0].toUpperCase();
            const disabled = status === 'taken' ? 'disabled' : '';
            const statsHtml = showStats && p.stats
                ? `<div class="cloud-profile-stats">${
                    Object.entries(p.stats).slice(0, 4).map(([k, v]) =>
                        `<span class="cloud-stat"><em>${escapeHtml(String(k))}</em> ${escapeHtml(String(v))}</span>`
                    ).join('')
                  }</div>`
                : '';

            return `
            <div class="cloud-profile-card ${cssClass}" data-profile-id="${escapeHtml(p.id)}">
                <div class="cloud-profile-avatar">${initial}</div>
                <div class="cloud-profile-info">
                    <span class="cloud-profile-name">${escapeHtml(p.name || '')}</span>
                    ${statsHtml}
                </div>
                <span class="cloud-profile-status-badge ${cssClass}">${label}</span>
                ${onSelect && status !== 'taken' ? `
                <button type="button" class="cloud-profile-select-btn"
                        onclick="SupabaseProfiles._handleSelect(this)"
                        data-profile-id="${escapeHtml(p.id)}"
                        ${disabled}>
                    ${status === 'mine' ? 'Ver' : 'Usar'}
                </button>` : ''}
            </div>`;
        }).join('');

        if (onSelect) SupabaseProfiles._onSelectCallback = onSelect;
    }

    function _handleSelect(btn) {
        const profileId = btn?.dataset?.profileId;
        if (!profileId || !SupabaseProfiles._onSelectCallback) return;
        const profile = (appData.cloudProfiles || []).find(p => p.id === profileId);
        if (profile) SupabaseProfiles._onSelectCallback(profile);
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    function init() {
        _ensureCloudProfilesKey();

        // Cargar userId en caché para comparaciones síncronas
        _getCurrentUser().catch(() => {});

        // Cargar perfiles
        if (_isAvailable()) {
            loadCloudProfiles().catch(() => {});
        }

        // Registrar listeners solo una vez
        if (_initDone) return;
        _initDone = true;

        // Re-cargar cuando el usuario cambia de sesión
        window.addEventListener('etheria:auth-changed', () => {
            _getCurrentUser().then(() => loadCloudProfiles()).catch(() => {});
        });

        // Cargar personajes cuando se activa un perfil
        window.addEventListener('etheria:active-profile-changed', (e) => {
            const profileId = e.detail?.profileId;
            if (profileId && typeof SupabaseCharacters !== 'undefined') {
                SupabaseCharacters.setActiveProfile(profileId).catch(() => {});
            }
        });
    }

    // ── API pública ──────────────────────────────────────────────────────────

    return {
        init,
        loadCloudProfiles,
        createCloudProfile,
        updateCloudProfileStats,
        releaseCloudProfile,
        isProfileTaken,
        getProfileStatus,
        getProfileStatusLabel,
        getProfileStatusClass,
        getMyProfiles,
        getFreeProfiles,
        renderCloudProfileList,
        _handleSelect,
        _onSelectCallback: null
    };

})();

window.SupabaseProfiles = SupabaseProfiles;
