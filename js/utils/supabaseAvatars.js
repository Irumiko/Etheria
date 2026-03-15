// ============================================
// SUPABASE AVATARS — Avatares en Storage
// ============================================
// Bucket: "avatars" (público)
// Path:   avatars/{characterId}.png
//
// uploadCharacterAvatar(characterId, file)
//   1. Sube imagen al bucket
//   2. Obtiene URL pública
//   3. Guarda avatar_url en characters
//   4. Actualiza el campo local appData.characters[*].avatar
// ============================================

const SupabaseAvatars = (function () {

    const BUCKET = 'avatars';

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client(); }

    function _ext(file) {
        const name = file?.name || '';
        const m = name.match(/\.(png|jpg|jpeg|gif|webp)$/i);
        return m ? m[1].toLowerCase() : 'png';
    }

    function _mimeForExt(ext) {
        const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
        return map[ext] || 'image/png';
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Sube un archivo de imagen como avatar de un personaje.
     *
     * @param {string}  characterId  UUID del personaje (tabla Supabase characters)
     *                               o ID local si no tiene UUID de Supabase.
     * @param {File}    file         Archivo de imagen seleccionado por el usuario.
     * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
     */
    async function uploadCharacterAvatar(characterId, file) {
        if (!_isAvailable()) {
            return { ok: false, error: 'Sin conexión a Supabase.' };
        }
        if (!characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        if (!file || !file.type.startsWith('image/')) {
            return { ok: false, error: 'El archivo debe ser una imagen.' };
        }
        if (file.size > 5 * 1024 * 1024) {
            return { ok: false, error: 'La imagen no puede superar 5 MB.' };
        }

        const ext  = _ext(file);
        const path = `${characterId}.${ext}`;

        try {
            const sb = _client();

            // 1. Subir al bucket (upsert para sobreescribir si ya existe)
            const { error: uploadError } = await sb.storage
                .from(BUCKET)
                .upload(path, file, {
                    contentType : _mimeForExt(ext),
                    upsert      : true
                });

            if (uploadError) {
                console.error('[SupabaseAvatars] upload error:', uploadError.message);
                return { ok: false, error: uploadError.message || 'Error al subir la imagen.' };
            }

            // 2. Obtener URL pública
            const { data: urlData } = sb.storage
                .from(BUCKET)
                .getPublicUrl(path);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) {
                return { ok: false, error: 'No se pudo obtener la URL pública del avatar.' };
            }

            // 3. Guardar avatar_url en la tabla characters de Supabase
            const { error: updateError } = await sb
                .from('characters')
                .update({ avatar_url: publicUrl })
                .eq('id', characterId);

            if (updateError) {
                const msg = updateError.message || 'No se pudo guardar avatar_url en BD.';
                console.warn('[SupabaseAvatars] No se pudo guardar avatar_url en BD:', msg);

                const missingColumn = msg.toLowerCase().includes('avatar_url')
                    && msg.toLowerCase().includes('column');

                return {
                    ok: false,
                    error: missingColumn
                        ? 'La imagen se subió, pero falta la columna avatar_url en la tabla characters. Ejecuta la migración de SUPABASE_SETUP.'
                        : `La imagen se subió, pero no se pudo vincular al personaje: ${msg}`
                };
            }

            // 4. Actualizar caché local de cloudCharacters
            if (typeof appData !== 'undefined' && appData.cloudCharacters) {
                for (const profileId of Object.keys(appData.cloudCharacters)) {
                    const chars = appData.cloudCharacters[profileId];
                    if (!Array.isArray(chars)) continue;
                    const idx = chars.findIndex(c => c.id === characterId);
                    if (idx !== -1) {
                        chars[idx].avatar_url = publicUrl;
                        break;
                    }
                }
            }

            // 5. Actualizar appData.characters (personajes locales, por si el ID coincide)
            if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
                const localChar = appData.characters.find(c => String(c.id) === String(characterId));
                if (localChar) {
                    localChar.avatar = publicUrl;
                    if (typeof persistPartitionedData === 'function') persistPartitionedData();
                }
            }

            // 6. Actualizar SupabaseCharacters cache si está disponible
            if (typeof SupabaseCharacters !== 'undefined') {
                const cachedChar = SupabaseCharacters.getActiveCharacters()
                    .find(c => c.id === characterId);
                if (cachedChar) cachedChar.avatar_url = publicUrl;
            }

            window.dispatchEvent(new CustomEvent('etheria:avatar-uploaded', {
                detail: { characterId, url: publicUrl }
            }));

            return { ok: true, url: publicUrl };

        } catch (err) {
            console.error('[SupabaseAvatars] uploadCharacterAvatar exception:', err);
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Elimina el avatar de un personaje del bucket.
     * @param {string} characterId
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function deleteCharacterAvatar(characterId) {
        if (!_isAvailable() || !characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        try {
            const sb = _client();
            // Intentar borrar tanto .png como otras extensiones comunes
            const paths = ['png', 'jpg', 'jpeg', 'webp', 'gif'].map(ext => `${characterId}.${ext}`);
            await sb.storage.from(BUCKET).remove(paths); // falla silencioso si no existen

            await sb.from('characters').update({ avatar_url: null }).eq('id', characterId);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Devuelve la URL del avatar de un personaje (desde caché o null).
     * Busca primero en cloudCharacters, luego en appData.characters.
     * @param {string} characterId
     * @returns {string|null}
     */
    function getAvatarUrl(characterId) {
        if (!characterId) return null;

        // Buscar en cloudCharacters
        if (typeof appData !== 'undefined' && appData.cloudCharacters) {
            for (const chars of Object.values(appData.cloudCharacters)) {
                if (!Array.isArray(chars)) continue;
                const c = chars.find(ch => ch.id === characterId);
                if (c?.avatar_url) return c.avatar_url;
            }
        }

        // Buscar en personajes locales
        if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
            const local = appData.characters.find(c => String(c.id) === String(characterId));
            if (local?.avatar) return local.avatar;
        }

        return null;
    }

    return {
        uploadCharacterAvatar,
        deleteCharacterAvatar,
        getAvatarUrl
    };

})();

window.SupabaseAvatars = SupabaseAvatars;
