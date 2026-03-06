// ============================================
// SUPABASE CHARACTERS — Personajes por perfil
// ============================================
// Tabla `characters`:
//   id          uuid  PK
//   profile_id  uuid  → profiles.id
//   name        text
//   stats       jsonb
//   created_at  timestamp
//
// Los personajes se cargan solo para el perfil activo.
// No modifica appData.characters ni el sistema local.
// ============================================

const SupabaseCharacters = (function () {

    // profileId → Array<character>
    const _cache = new Map();
    let _activeProfileId = null;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() {
        return window.supabaseClient || null;
    }

    function _isAvailable() {
        return !!_client();
    }

    // Fix C: cached user id — populated on etheria:auth-changed to avoid getUser() per-operation
    let _cachedUserId = window._cachedUserId || null;
    window.addEventListener('etheria:auth-changed', function (e) {
        _cachedUserId = e.detail?.user?.id || window._cachedUserId || null;
    });

    async function _getCurrentUser() {
        const cachedId = _cachedUserId || window._cachedUserId || null;
        if (cachedId) return { id: cachedId }; // Fix C: fast-path, no network
        const sb = _client();
        if (!sb) return null;
        try {
            const { data, error } = await sb.auth.getUser();
            if (error || !data?.user) return null;
            _cachedUserId = data.user.id;
            return data.user;
        } catch { return null; }
    }

    async function _isProfileOwner(profileId) {
        const user = await _getCurrentUser();
        if (!user) return false;

        // Buscar en caché de perfiles primero (evita petición extra)
        if (Array.isArray(appData?.cloudProfiles)) {
            const prof = appData.cloudProfiles.find(p => p.id === profileId);
            if (prof) return prof.owner_user_id === user.id;
        }

        // Fallback: consultar Supabase directamente
        try {
            const { data } = await _client()
                .from('profiles')
                .select('owner_user_id')
                .eq('id', profileId)
                .single();
            return data?.owner_user_id === user.id;
        } catch { return false; }
    }

    function _updateAppDataCache(profileId, chars) {
        if (typeof appData === 'undefined') return;
        if (!appData.cloudCharacters) appData.cloudCharacters = {};
        appData.cloudCharacters[profileId] = chars;
    }

    // ── API pública ───────────────────────────────────────────────────────────

    async function loadCharacters(profileId) {
        if (!_isAvailable() || !profileId) return [];
        try {
            const { data, error } = await _client()
                .from('characters')
                .select('*')
                .eq('profile_id', profileId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[SupabaseCharacters] loadCharacters:', error.message);
                return [];
            }

            const chars = Array.isArray(data) ? data : [];
            _cache.set(profileId, chars);
            _activeProfileId = profileId;
            _updateAppDataCache(profileId, chars);

            window.dispatchEvent(new CustomEvent('etheria:cloud-characters-loaded', {
                detail: { profileId, characters: chars }
            }));
            return chars;
        } catch (err) {
            console.error('[SupabaseCharacters] loadCharacters exception:', err);
            return [];
        }
    }

    async function createCharacter(profileId, name, stats = {}) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        if (!profileId)       return { ok: false, error: 'Se requiere un perfil activo.' };

        const trimmedName = String(name || '').trim();
        if (!trimmedName) return { ok: false, error: 'El nombre del personaje no puede estar vacío.' };

        const isOwner = await _isProfileOwner(profileId);
        if (!isOwner) return { ok: false, error: 'Solo el dueño del perfil puede añadir personajes.' };

        try {
            const { data, error } = await _client()
                .from('characters')
                .insert({ profile_id: profileId, name: trimmedName, stats: stats || {} })
                .select()
                .single();

            if (error) return { ok: false, error: error.message || 'Error al crear el personaje.' };

            // Actualizar caché
            const list = _cache.get(profileId) || [];
            list.push(data);
            _cache.set(profileId, list);
            _updateAppDataCache(profileId, list);

            window.dispatchEvent(new CustomEvent('etheria:cloud-character-created', {
                detail: { profileId, character: data }
            }));
            return { ok: true, character: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function updateCharacter(characterId, stats) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        try {
            const { data, error } = await _client()
                .from('characters')
                .update({ stats })
                .eq('id', characterId)
                .select()
                .single();

            if (error) return { ok: false, error: error.message };

            const profileId = data.profile_id;
            const list = _cache.get(profileId);
            if (list) {
                const idx = list.findIndex(c => c.id === characterId);
                if (idx !== -1) { list[idx] = data; _updateAppDataCache(profileId, list); }
            }
            return { ok: true, character: data };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function deleteCharacter(characterId, profileId) {
        if (!_isAvailable()) return { ok: false, error: 'Sin conexión a Supabase.' };
        try {
            const { error } = await _client()
                .from('characters')
                .delete()
                .eq('id', characterId);

            if (error) return { ok: false, error: error.message };

            if (profileId && _cache.has(profileId)) {
                const updated = _cache.get(profileId).filter(c => c.id !== characterId);
                _cache.set(profileId, updated);
                _updateAppDataCache(profileId, updated);
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    async function setActiveProfile(profileId) {
        _activeProfileId = profileId;
        return loadCharacters(profileId);
    }

    function getActiveCharacters() {
        if (!_activeProfileId) return [];
        return _cache.get(_activeProfileId) || [];
    }

    function getCachedCharacters(profileId) {
        return _cache.get(profileId) || [];
    }

    function clearCache(profileId) {
        if (profileId) {
            _cache.delete(profileId);
            if (appData?.cloudCharacters) delete appData.cloudCharacters[profileId];
        } else {
            _cache.clear();
            if (typeof appData !== 'undefined') appData.cloudCharacters = {};
        }
    }

    return {
        loadCharacters,
        createCharacter,
        updateCharacter,
        deleteCharacter,
        setActiveProfile,
        getActiveCharacters,
        getCachedCharacters,
        clearCache,
        get activeProfileId() { return _activeProfileId; }
    };

})();

window.SupabaseCharacters = SupabaseCharacters;
