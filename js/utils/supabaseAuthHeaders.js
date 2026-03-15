(function initSupabaseAuthHeaders(global) {
    async function getAccessToken(client) {
        try {
            if (!client || typeof client.auth?.getSession !== 'function') return null;
            const { data: { session } } = await client.auth.getSession();
            return session?.access_token || null;
        } catch (_) {
            return null;
        }
    }

    async function buildAuthHeaders({ apikey, client, baseHeaders = {}, acceptJson = false }) {
        const token = await getAccessToken(client);
        const headers = {
            apikey,
            Authorization: `Bearer ${token || apikey}`,
            ...baseHeaders,
        };
        if (acceptJson) headers.Accept = 'application/json';
        return headers;
    }

    global.SupabaseAuthHeaders = { getAccessToken, buildAuthHeaders };
})(window);
