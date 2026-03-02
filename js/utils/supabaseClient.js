// ============================================
// SUPABASE CLIENT GLOBAL
// ============================================
// Cliente único para Auth y operaciones generales.
// Reutiliza configuración pública para evitar duplicación.

(function (global) {
    const DEFAULT_SUPABASE_CONFIG = {
        url: 'https://timtqdrfeuzwwixfnudj.supabase.co',
        key: 'sb_publishable_imGaxAfo_z1NuG6NV8pDtQ_A6Wp3DH3'
    };

    const existingConfig = global.SUPABASE_CONFIG || {};
    const config = {
        url: existingConfig.url || DEFAULT_SUPABASE_CONFIG.url,
        key: existingConfig.key || DEFAULT_SUPABASE_CONFIG.key
    };

    global.SUPABASE_CONFIG = config;

    try {
        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            console.warn('[Supabase] Librería supabase-js no disponible para inicializar cliente global.');
            return;
        }

        if (!global.supabaseClient) {
            global.supabaseClient = global.supabase.createClient(config.url, config.key);
        }
    } catch (error) {
        console.warn('[Supabase] Error al crear cliente global:', error?.message || error);
    }
}(window));
