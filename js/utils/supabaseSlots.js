// ============================================================
// SUPABASE SLOTS — Sincronización cross-device de slots de perfil
// ============================================================
// Almacena en user_settings.slot_data los nombres y propietarios
// de cada slot. Es la fuente de verdad cuando el usuario tiene sesión:
//   slot_data = { names: string[], owners: string[] }
//
// El localStorage (etheria_user_names, etheria_profile_owners) actúa
// como caché offline. En cada inicio de sesión se sincroniza desde
// Supabase; en cada cambio de slots, se persiste en Supabase.
// ============================================================

const SupabaseSlots = (function () {

    function _client() {
        return window.supabaseClient || null;
    }

    async function _getUserId() {
        const sb = _client();
        if (!sb) return null;
        try {
            const { data, error } = await sb.auth.getUser();
            if (error || !data?.user?.id) return null;
            return data.user.id;
        } catch { return null; }
    }

    // ── Carga slots desde Supabase ────────────────────────────────────────────
    // Devuelve { names, owners } o null si no hay sesión / falla la red.
    async function loadSlots() {
        const sb = _client();
        if (!sb) return null;
        const userId = await _getUserId();
        if (!userId) return null;

        try {
            const { data, error } = await sb
                .from('user_settings')
                .select('slot_data')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                window.EtheriaLogger?.warn('supabaseSlots', 'loadSlots error:', error.message);
                return null;
            }

            // Fila inexistente todavía (usuario nuevo) — devuelve vacío
            if (!data) return { names: [], owners: [] };

            const sd = data.slot_data;
            return {
                names:  Array.isArray(sd?.names)  ? sd.names  : [],
                owners: Array.isArray(sd?.owners) ? sd.owners : [],
            };
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseSlots', 'loadSlots exception:', err?.message);
            return null;
        }
    }

    // ── Guarda slots en Supabase ──────────────────────────────────────────────
    // Hace upsert en user_settings para el usuario actual.
    async function saveSlots(names, owners) {
        const sb = _client();
        if (!sb) return false;
        const userId = await _getUserId();
        if (!userId) return false;

        const slot_data = {
            names:  Array.isArray(names)  ? names  : [],
            owners: Array.isArray(owners) ? owners : [],
        };

        try {
            const { error } = await sb
                .from('user_settings')
                .upsert(
                    { user_id: userId, slot_data },
                    { onConflict: 'user_id', ignoreDuplicates: false }
                );

            if (error) {
                window.EtheriaLogger?.warn('supabaseSlots', 'saveSlots error:', error.message);
                return false;
            }
            return true;
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseSlots', 'saveSlots exception:', err?.message);
            return false;
        }
    }

    // ── Sincronización en el arranque ─────────────────────────────────────────
    // Llama a esto justo después de verificar la sesión.
    // Prioridad: Supabase > localStorage.
    // Si Supabase tiene datos → sobreescribe localStorage.
    // Si Supabase está vacío pero localStorage tiene datos → sube localStorage a Supabase.
    async function syncOnLogin() {
        const remote = await loadSlots();
        if (remote === null) return; // sin red o sin sesión — trabajar con localStorage

        const localNames  = (function () {
            try { return JSON.parse(localStorage.getItem('etheria_user_names')  || '[]'); } catch { return []; }
        }());
        const localOwners = (function () {
            try { return JSON.parse(localStorage.getItem('etheria_profile_owners') || '[]'); } catch { return []; }
        }());

        if (remote.names.length > 0) {
            // Supabase tiene datos → usarlos como fuente de verdad
            localStorage.setItem('etheria_user_names',     JSON.stringify(remote.names));
            localStorage.setItem('etheria_profile_owners', JSON.stringify(remote.owners));
            window.EtheriaLogger?.info('supabaseSlots', `Slots cargados desde Supabase: [${remote.names.join(', ')}]`);
        } else if (localNames.length > 0) {
            // Supabase vacío pero hay datos locales → subir a Supabase
            await saveSlots(localNames, localOwners);
            window.EtheriaLogger?.info('supabaseSlots', `Slots locales subidos a Supabase: [${localNames.join(', ')}]`);
        }
    }

    // ── Persiste el estado actual de slots ────────────────────────────────────
    // Llama a esto tras cualquier cambio en userNames o etheria_profile_owners.
    async function persistCurrentSlots() {
        try {
            const names  = JSON.parse(localStorage.getItem('etheria_user_names')  || '[]');
            const owners = JSON.parse(localStorage.getItem('etheria_profile_owners') || '[]');
            await saveSlots(names, owners);
        } catch (err) {
            window.EtheriaLogger?.warn('supabaseSlots', 'persistCurrentSlots exception:', err?.message);
        }
    }

    return { loadSlots, saveSlots, syncOnLogin, persistCurrentSlots };

}());

window.SupabaseSlots = SupabaseSlots;
