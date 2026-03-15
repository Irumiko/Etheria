// ============================================
// SUPABASE CLIENT GLOBAL
// ============================================
// Cliente único para Auth y operaciones generales.
// Reutiliza configuración pública para evitar duplicación.

(function (global) {
    const config = global.SUPABASE_CONFIG || {};
    const logger = global.EtheriaLogger;

    global.SUPABASE_CONFIG = config;

    try {
        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            logger?.warn('supabase', 'Librería supabase-js no disponible para inicializar cliente global.');
            return;
        }

        if (!global.supabaseClient) {
            if (!config.url || !config.key) {
                logger?.error('supabase', 'Configuración Supabase incompleta.');
                return;
            }
            global.supabaseClient = global.supabase.createClient(config.url, config.key);
        }
    } catch (error) {
        logger?.error('supabase', 'Error al crear cliente global:', error?.message || error);
    }
}(window));
