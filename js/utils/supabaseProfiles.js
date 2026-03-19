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
// RLS esperado: SELECT de perfiles libres o propios / INSERT+UPDATE solo owner
// ============================================

const SupabaseProfiles = (function () {

    let _initDone = false;   // guard contra init() múltiple
    const ACTIVE_PROFILE_STORAGE_KEY = 'etheria_active_cloud_profile_id';

    // ── Helpers internos ─────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    // supabase-js v2: userId solo disponible async via getUser().
    // Guardamos el último userId conocido en caché local para comparaciones síncronas.
    let _cachedUserId = null;
    let _activeProfileId = null;

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

    function _readStoredActiveProfileId() {
        try {
            return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || null;
        } catch {
            return null;
        }
    }

    function _storeActiveProfileId(profileId) {
        try {
            if (profileId) localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
            else localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
        } catch {
            // ignore storage failures
        }
    }

    function _emitActiveProfileChanged(profileId, reason = 'manual') {
        window.dispatchEvent(new CustomEvent('etheria:active-profile-changed', {
            detail: { profileId: profileId || null, reason }
        }));
    }

    // ── Perfiles ─────────────────────────────────────────────────────────────

    async function loadCloudProfiles() {
        if (!_isAvailable()) return [];
        _ensureCloudProfilesKey();
        try {
            const user = await _getCurrentUser();
            const userId = user?.id || null;

            let query = _client()
                .from('profiles')
                .select('*')
                .order('name', { ascending: true });

            // Evitar exponer perfiles ocupados por terceros en la UI.
            // - Usuario autenticado: ver libres + propios.
            // - Usuario no autenticado: ver solo libres.
            query = userId
                ? query.or(`owner_user_id.is.null,owner_user_id.eq.${userId}`)
                : query.is('owner_user_id', null);

            const { data, error } = await query;

            if (error) {
                window.EtheriaLogger?.warn('[SupabaseProfiles]', 'loadCloudProfiles:', error.message);
                return [];
            }
            appData.cloudProfiles = Array.isArray(data) ? data : [];
            window.dispatchEvent(new CustomEvent('etheria:cloud-profiles-loaded', {
                detail: { profiles: appData.cloudProfiles }
            }));
            return appData.cloudProfiles;
        } catch (err) {
            window.EtheriaLogger?.warn('[SupabaseProfiles]', 'loadCloudProfiles exception:', err);
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

    async function claimCloudProfile(profileId) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        const user = await _getCurrentUser();
        if (!user) return { ok: false, error: 'No autenticado.' };
        try {
            // Claim atómico: solo funciona si sigue libre en servidor.
            const { data, error } = await _client()
                .from('profiles')
                .update({ owner_user_id: user.id })
                .eq('id', profileId)
                .is('owner_user_id', null)
                .select()
                .single();

            if (error) return { ok: false, error: error.message || 'No se pudo reclamar el perfil.' };

            _ensureCloudProfilesKey();
            const idx = appData.cloudProfiles.findIndex(p => p.id === profileId);
            if (idx !== -1) {
                appData.cloudProfiles[idx] = data;
            } else {
                appData.cloudProfiles.push(data);
            }
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

    function getActiveProfileId() {
        return _activeProfileId;
    }

    function getActiveProfile() {
        if (!_activeProfileId || !Array.isArray(appData?.cloudProfiles)) return null;
        return appData.cloudProfiles.find(p => p.id === _activeProfileId) || null;
    }

    async function activateProfile(profileId, options = {}) {
        const { claimIfFree = true } = options;
        if (!profileId) {
            _activeProfileId = null;
            _storeActiveProfileId(null);
            _emitActiveProfileChanged(null, 'cleared');
            return { ok: true, profile: null };
        }

        const profile = (appData.cloudProfiles || []).find(p => p.id === profileId);
        if (!profile) return { ok: false, error: 'Perfil no encontrado.' };

        let resolved = profile;
        const status = getProfileStatus(profile);

        if (status === 'taken') {
            return { ok: false, error: 'Este perfil ya está ocupado por otro usuario.' };
        }

        if (status === 'free' && claimIfFree) {
            const claim = await claimCloudProfile(profileId);
            if (!claim.ok) {
                await loadCloudProfiles();
                return { ok: false, error: claim.error || 'No se pudo reclamar el perfil.' };
            }
            resolved = claim.profile || profile;
        }

        _activeProfileId = resolved.id;
        _storeActiveProfileId(_activeProfileId);
        _emitActiveProfileChanged(_activeProfileId, 'activated');
        return { ok: true, profile: resolved };
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

    async function _handleSelect(btn) {
        const profileId = btn?.dataset?.profileId;
        if (!profileId || !SupabaseProfiles._onSelectCallback) return;

        const result = await activateProfile(profileId, { claimIfFree: true });
        if (!result.ok) {
            if (typeof eventBus !== 'undefined') {
                eventBus.emit('ui:show-autosave', {
                    text: result.error || 'No se pudo activar el perfil.',
                    state: 'error'
                });
            }
            return;
        }

        if (result.profile) SupabaseProfiles._onSelectCallback(result.profile);
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    // ── Activación automática del perfil ────────────────────────────────────
    // Reglas en orden de prioridad:
    //  1. Si hay un perfil activo guardado en localStorage y sigue siendo del usuario → usarlo
    //  2. Si el usuario tiene exactamente un perfil propio → activarlo automáticamente
    //  3. Si el usuario no tiene ningún perfil → crear uno y activarlo
    // El usuario nunca tiene que hacer nada para tener un perfil funcional.
    async function _autoActivateProfile() {
        const profiles = appData.cloudProfiles || [];
        const user     = await _getCurrentUser().catch(() => null);
        if (!user?.id) return;

        // Opción 1: restaurar perfil guardado si sigue siendo nuestro
        const storedId = _readStoredActiveProfileId();
        if (storedId) {
            const stored = profiles.find(p => p.id === storedId && p.owner_user_id === user.id);
            if (stored) {
                _activeProfileId = storedId;
                _emitActiveProfileChanged(storedId, 'restored');
                return;
            }
        }

        // Opción 2: activar el único perfil propio
        const mine = profiles.filter(p => p.owner_user_id === user.id);
        if (mine.length === 1) {
            _activeProfileId = mine[0].id;
            _storeActiveProfileId(_activeProfileId);
            _emitActiveProfileChanged(_activeProfileId, 'auto-activated');
            return;
        }

        // Si hay varios perfiles propios, activar el más reciente
        if (mine.length > 1) {
            const newest = mine.sort((a, b) =>
                new Date(b.created_at || 0) - new Date(a.created_at || 0)
            )[0];
            _activeProfileId = newest.id;
            _storeActiveProfileId(_activeProfileId);
            _emitActiveProfileChanged(_activeProfileId, 'auto-activated');
            return;
        }

        // Opción 3: el usuario no tiene ningún perfil — crear uno automáticamente
        // Esto cubre usuarios nuevos cuyo trigger aún no haya corrido o falle silenciosamente
        try {
            const displayName = user.email?.split('@')[0] || 'Jugador';
            const { data, error } = await _client()
                .from('profiles')
                .insert({ user_id: user.id, name: displayName, owner_user_id: user.id })
                .select()
                .single();

            if (!error && data?.id) {
                if (!appData.cloudProfiles) appData.cloudProfiles = [];
                appData.cloudProfiles.push(data);
                _activeProfileId = data.id;
                _storeActiveProfileId(_activeProfileId);
                _emitActiveProfileChanged(_activeProfileId, 'created-and-activated');
            }
        } catch (e) {
            window.EtheriaLogger?.warn('supabaseProfiles', 'No se pudo crear perfil automático:', e?.message);
        }
    }

    function init() {
        _ensureCloudProfilesKey();

        // Cargar userId en caché para comparaciones síncronas
        _getCurrentUser().catch(() => {});

        // Cargar perfiles y activar automáticamente el correcto
        if (_isAvailable()) {
            loadCloudProfiles()
                .then(() => _autoActivateProfile())
                .catch(() => {});
        }

        // Registrar listeners solo una vez
        if (_initDone) return;
        _initDone = true;

        // Re-cargar y re-activar cuando el usuario cambia de sesión
        window.addEventListener('etheria:auth-changed', (e) => {
            const userId = e.detail?.user?.id || null;
            if (!userId) {
                _cachedUserId = null;
                _activeProfileId = null;
                _storeActiveProfileId(null);
                _emitActiveProfileChanged(null, 'signed-out');
                return;
            }
            // Usuario autenticado: recargar perfiles y activar el correcto
            _getCurrentUser()
                .then(() => loadCloudProfiles())
                .then(() => _autoActivateProfile())
                .catch(() => {});
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
        claimCloudProfile,
        releaseCloudProfile,
        isProfileTaken,
        getProfileStatus,
        getProfileStatusLabel,
        getProfileStatusClass,
        getMyProfiles,
        getFreeProfiles,
        getActiveProfileId,
        getActiveProfile,
        activateProfile,
        renderCloudProfileList,
        _handleSelect,
        _onSelectCallback: null
    };

})();

window.SupabaseProfiles = SupabaseProfiles;
