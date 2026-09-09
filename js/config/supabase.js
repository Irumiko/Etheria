(function initSupabaseConfig(global) {
    const DEFAULT_SUPABASE_CONFIG = {
        url: 'https://timtqdrfeuzwwixfnudj.supabase.co',
        key: 'sb_publishable_imGaxAfo_z1NuG6NV8pDtQ_A6Wp3DH3'
    };

    // Clave pública VAPID (par generado para Web Push). La privada solo vive
    // como secreto de las Edge Functions en Supabase — esta es segura de
    // exponer en el cliente, es la mitad "pública" del par.
    const DEFAULT_VAPID_PUBLIC_KEY =
        'BA8fErftKFw8DfoLlKRekzs11XUDdGuiyB85Qv1uOZ7LZ3ADOXGI63KgnE62NSh5D_fVsvIAFuzPFQcDAle5Ykg';

    const fromGlobal = global.SUPABASE_CONFIG || {};
    const fromEnv = global.__ETHERIA_ENV__?.supabase || {};

    global.SUPABASE_CONFIG = {
        url: fromEnv.url || fromGlobal.url || DEFAULT_SUPABASE_CONFIG.url,
        key: fromEnv.key || fromGlobal.key || DEFAULT_SUPABASE_CONFIG.key
    };

    global.ETHERIA_VAPID_PUBLIC_KEY =
        global.__ETHERIA_ENV__?.vapidPublicKey || global.ETHERIA_VAPID_PUBLIC_KEY || DEFAULT_VAPID_PUBLIC_KEY;
})(window);
