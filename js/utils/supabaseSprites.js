// ============================================
// SUPABASE SPRITES — Sprites en Storage
// ============================================
// Bucket: "sprites" (público)
// Path:   sprites/{characterId}.{ext}
//
// uploadCharacterSprite(characterId, file)
//   1. Sube imagen al bucket sprites
//   2. Obtiene URL pública
//   3. Guarda sprite_url en la tabla characters
//   4. Actualiza el campo local appData.characters[*].sprite
// ============================================

const SupabaseSprites = (function () {

    const BUCKET = 'sprites';

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
     * Sube un archivo de imagen como sprite de un personaje.
     *
     * @param {string} characterId  UUID del personaje (tabla Supabase characters) o ID local.
     * @param {File}   file         Archivo de imagen seleccionado por el usuario.
     * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
     */
    async function uploadCharacterSprite(characterId, file) {
        if (!_isAvailable()) {
            return { ok: false, error: 'Sin conexión a Supabase.' };
        }
        if (!characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        if (!file || !file.type.startsWith('image/')) {
            return { ok: false, error: 'El archivo debe ser una imagen.' };
        }
        if (file.size > 10 * 1024 * 1024) {
            return { ok: false, error: 'La imagen no puede superar 10 MB.' };
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
                console.error('[SupabaseSprites] upload error:', uploadError.message);
                return { ok: false, error: uploadError.message || 'Error al subir la imagen.' };
            }

            // 2. Obtener URL pública
            const { data: urlData } = sb.storage
                .from(BUCKET)
                .getPublicUrl(path);

            const publicUrl = urlData?.publicUrl;
            if (!publicUrl) {
                return { ok: false, error: 'No se pudo obtener la URL pública del sprite.' };
            }

            // 3. Guardar sprite_url en la tabla characters de Supabase
            const { error: updateError } = await sb
                .from('characters')
                .update({ sprite_url: publicUrl })
                .eq('id', characterId);

            if (updateError) {
                const msg = updateError.message || 'No se pudo guardar sprite_url en BD.';
                console.warn('[SupabaseSprites] No se pudo guardar sprite_url en BD:', msg);
                return {
                    ok: false,
                    error: `La imagen se subió, pero no se pudo vincular al personaje: ${msg}`
                };
            }

            // 4. Actualizar caché local de cloudCharacters
            if (typeof appData !== 'undefined' && appData.cloudCharacters) {
                for (const profileId of Object.keys(appData.cloudCharacters)) {
                    const chars = appData.cloudCharacters[profileId];
                    if (!Array.isArray(chars)) continue;
                    const idx = chars.findIndex(c => c.id === characterId);
                    if (idx !== -1) {
                        chars[idx].sprite_url = publicUrl;
                        break;
                    }
                }
            }

            // 5. Actualizar appData.characters (personajes locales)
            if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
                const localChar = appData.characters.find(c => String(c.id) === String(characterId));
                if (localChar) {
                    localChar.sprite = publicUrl;
                    if (typeof persistPartitionedData === 'function') persistPartitionedData();
                }
            }

            // 6. Actualizar SupabaseCharacters cache si está disponible
            if (typeof SupabaseCharacters !== 'undefined') {
                const cachedChar = SupabaseCharacters.getActiveCharacters()
                    .find(c => c.id === characterId);
                if (cachedChar) cachedChar.sprite_url = publicUrl;
            }

            // 7. Actualizar el campo sprite en el editor si está abierto
            const spriteInput = document.getElementById('charSprite');
            if (spriteInput) {
                spriteInput.value = publicUrl;
            }

            window.dispatchEvent(new CustomEvent('etheria:sprite-uploaded', {
                detail: { characterId, url: publicUrl }
            }));

            return { ok: true, url: publicUrl };

        } catch (err) {
            console.error('[SupabaseSprites] uploadCharacterSprite exception:', err);
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Elimina el sprite de un personaje del bucket.
     * @param {string} characterId
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async function deleteCharacterSprite(characterId) {
        if (!_isAvailable() || !characterId) {
            return { ok: false, error: 'characterId requerido.' };
        }
        try {
            const sb = _client();
            const paths = ['png', 'jpg', 'jpeg', 'webp', 'gif'].map(ext => `${characterId}.${ext}`);
            await sb.storage.from(BUCKET).remove(paths);
            await sb.from('characters').update({ sprite_url: null }).eq('id', characterId);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err?.message || 'Error inesperado.' };
        }
    }

    /**
     * Devuelve la URL del sprite de un personaje desde caché local.
     * @param {string} characterId
     * @returns {string|null}
     */
    function getSpriteUrl(characterId) {
        if (!characterId) return null;

        if (typeof appData !== 'undefined' && appData.cloudCharacters) {
            for (const chars of Object.values(appData.cloudCharacters)) {
                if (!Array.isArray(chars)) continue;
                const c = chars.find(ch => ch.id === characterId);
                if (c?.sprite_url) return c.sprite_url;
            }
        }

        if (typeof appData !== 'undefined' && Array.isArray(appData.characters)) {
            const local = appData.characters.find(c => String(c.id) === String(characterId));
            if (local?.sprite) return local.sprite;
        }

        return null;
    }

    return {
        uploadCharacterSprite,
        deleteCharacterSprite,
        getSpriteUrl
    };

})();

window.SupabaseSprites = SupabaseSprites;
