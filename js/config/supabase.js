(function initSupabaseConfig(global) {
    const DEFAULT_SUPABASE_CONFIG = {
        url: 'https://timtqdrfeuzwwixfnudj.supabase.co',
        key: 'sb_publishable_imGaxAfo_z1NuG6NV8pDtQ_A6Wp3DH3'
    };

    const fromGlobal = global.SUPABASE_CONFIG || {};
    const fromEnv = global.__ETHERIA_ENV__?.supabase || {};

    global.SUPABASE_CONFIG = {
        url: fromEnv.url || fromGlobal.url || DEFAULT_SUPABASE_CONFIG.url,
        key: fromEnv.key || fromGlobal.key || DEFAULT_SUPABASE_CONFIG.key
    };
})(window);
