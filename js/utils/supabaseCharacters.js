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

    // Fusiona los personajes cargados de Supabase con appData.characters (fuente de verdad de la UI).
    // Convierte las columnas snake_case de la BD al formato camelCase que usa la app.
    function _updateAppDataCache(profileId, chars) {
        if (typeof appData === 'undefined') return;
        if (!appData.cloudCharacters) appData.cloudCharacters = {};
        appData.cloudCharacters[profileId] = chars;

        // Fusionar en appData.characters para que la galería, el modo RPG y
        // el IHP vean los personajes de la nube igual que los locales
        if (!Array.isArray(appData.characters)) appData.characters = [];
        chars.forEach(row => {
            const local = appData.characters.find(c => String(c.id) === String(row.id));
            const mapped = _rowToChar(row);
            if (local) {
                // Actualizar campos que pueden haber cambiado en la nube
                Object.assign(local, mapped);
            } else {
                appData.characters.push(mapped);
            }
        });
    }

    // Convierte una fila de la tabla characters al formato del objeto local
    function _rowToChar(row) {
        return {
            id:          row.id,
            userIndex:   row.user_index   ?? 0,
            owner:       row.owner        || '',
            name:        row.name         || '',
            lastName:    row.last_name    || '',
            age:         row.age          || '',
            race:        row.race         || '',
            gender:      row.gender       || '',
            alignment:   row.alignment    || '',
            job:         row.job          || '',
            color:       row.color        || '#8b7355',
            avatar:      row.avatar_url   || '',
            sprite:      row.sprite_url   || '',
            basic:       row.basic        || '',
            personality: row.personality  || '',
            history:     row.history      || '',
            notes:       row.notes        || '',
            rpgProfile:  row.rpg_profile  || undefined,
            stats:       row.stats        || {}
        };
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
                window.EtheriaLogger?.warn('[SupabaseCharacters]', 'loadCharacters:', error.message);
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
            window.EtheriaLogger?.warn('[SupabaseCharacters]', 'loadCharacters exception:', err);
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

    // Sincroniza un personaje completo con Supabase.
    // Crea o actualiza (upsert) todos los campos, incluidos los nuevos
    // que antes solo vivían en el blob de user_data.
    // El id local del personaje se usa como id en Supabase para mantener coherencia.
    async function upsertCharacter(charObj, profileId) {
        if (!_isAvailable() || !charObj?.id || !profileId) return { ok: false };
        try {
            const row = {
                id:          String(charObj.id),
                profile_id:  profileId,
                name:        charObj.name || 'Sin nombre',
                last_name:   charObj.lastName   || null,
                age:         charObj.age         || null,
                race:        charObj.race        || null,
                gender:      charObj.gender      || null,
                alignment:   charObj.alignment   || null,
                job:         charObj.job         || null,
                color:       charObj.color       || '#8b7355',
                basic:       charObj.basic       || null,
                personality: charObj.personality || null,
                history:     charObj.history     || null,
                notes:       charObj.notes       || null,
                owner:       charObj.owner       || null,
                user_index:  typeof charObj.userIndex === 'number' ? charObj.userIndex : null,
                avatar_url:  charObj.avatar      || null,
                sprite_url:  charObj.sprite      || null,
                stats:       charObj.stats       || {},
                rpg_profile: charObj.rpgProfile  || null,
                updated_at:  new Date().toISOString()
            };

            const { data, error } = await _client()
                .from('characters')
                .upsert(row, { onConflict: 'id' })
                .select()
                .single();

            if (error) {
                window.EtheriaLogger?.warn('supabaseCharacters', 'upsertCharacter failed:', error.message);
                return { ok: false, error: error.message };
            }
            return { ok: true, character: data };
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseCharacters', 'upsertCharacter error:', err?.message);
            return { ok: false, error: err?.message };
        }
    }

    // Sube todos los personajes locales a Supabase de una vez.
    // Se llama al activarse el perfil activo del usuario.
    // Filtra por userIndex para que cada usuario solo suba sus propios personajes.
    async function syncAllLocalCharacters(characters, profileId) {
        if (!_isAvailable() || !Array.isArray(characters) || !profileId) return;

        // Solo sincronizar los personajes del índice de usuario actual
        const myIndex = typeof currentUserIndex !== 'undefined' ? currentUserIndex : 0;
        const myChars = characters.filter(c =>
            c.userIndex === myIndex || typeof c.userIndex === 'undefined'
        );

        if (!myChars.length) return { ok: true, synced: 0 };

        const results = await Promise.allSettled(
            myChars.map(c => upsertCharacter(c, profileId))
        );
        const synced = results.filter(r => r.value?.ok === true).length;
        const failed = results.length - synced;
        if (failed > 0) {
            window.EtheriaLogger?.warn('supabaseCharacters',
                `${failed}/${myChars.length} personajes no se sincronizaron`);
        }
        return { ok: failed === 0, synced };
    }

    return {
        loadCharacters,
        createCharacter,
        updateCharacter,
        upsertCharacter,
        syncAllLocalCharacters,
        deleteCharacter,
        setActiveProfile,
        getActiveCharacters,
        getCachedCharacters,
        clearCache,
        get activeProfileId() { return _activeProfileId; }
    };

})();

window.SupabaseCharacters = SupabaseCharacters;
