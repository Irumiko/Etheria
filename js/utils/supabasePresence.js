// ============================================
// SUPABASE PRESENCE — presencia en historias
// ============================================
// Usa canales Realtime Presence (sin tabla) para indicar
// qué usuarios están activos en cada historia en este momento.

(function (global) {
    const logger = global.EtheriaLogger;

    let _client = null;
    let _channel = null;
    let _storyId = null;
    let _online = new Map(); // user_id -> metadata

    function _getClient() {
        if (_client) return _client;
        try {
            _client = global.supabaseClient || (global.supabase?.createClient
                ? global.supabase.createClient(global.SUPABASE_CONFIG?.url, global.SUPABASE_CONFIG?.key)
                : null);
        } catch (error) {
            logger?.warn('supabase:presence', 'client init failed:', error?.message || error);
            _client = null;
        }
        return _client;
    }

    async function _getCurrentUserId() {
        if (global._cachedUserId) return global._cachedUserId;
        const client = _getClient();
        if (!client?.auth?.getUser) return null;
        try {
            const { data, error } = await client.auth.getUser();
            if (error || !data?.user?.id) return null;
            global._cachedUserId = data.user.id;
            return data.user.id;
        } catch {
            return null;
        }
    }

    function _emitPresenceChange() {
        const userIds = [..._online.keys()];
        global.dispatchEvent(new CustomEvent('etheria:story-presence-changed', {
            detail: {
                storyId: _storyId,
                userIds,
                state: Object.fromEntries(_online.entries())
            }
        }));
    }

    function _readLocalIdentity() {
        let avatarUrl = '';
        let displayName = 'Jugador';

        try {
            const idx = Number(global.currentUserIndex || 0);
            const names = Array.isArray(global.userNames) ? global.userNames : [];
            displayName = (names[idx] || names[0] || 'Jugador').trim() || 'Jugador';
            const avatars = JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]');
            avatarUrl = avatars[idx] || localStorage.getItem('etheria_cloud_avatar_url') || '';
        } catch {}

        return { displayName, avatarUrl };
    }

    function _syncPresenceState() {
        if (!_channel) return;
        const state = _channel.presenceState ? _channel.presenceState() : {};
        _online.clear();
        Object.values(state || {}).forEach((metas) => {
            const arr = Array.isArray(metas) ? metas : [];
            arr.forEach((meta) => {
                const uid = meta?.user_id;
                if (!uid) return;
                _online.set(String(uid), meta);
            });
        });
        _emitPresenceChange();
    }

    async function joinStory(storyId) {
        if (!storyId) return false;
        const client = _getClient();
        if (!client?.channel) return false;

        await leaveStory();

        const userId = await _getCurrentUserId();
        if (!userId) return false;

        _storyId = String(storyId);
        _online.clear();

        try {
            _channel = client
                .channel(`presence:story:${_storyId}`, {
                    config: {
                        presence: { key: String(userId) }
                    }
                })
                .on('presence', { event: 'sync' }, _syncPresenceState)
                .on('presence', { event: 'join' }, _syncPresenceState)
                .on('presence', { event: 'leave' }, _syncPresenceState);

            _channel.subscribe(async (status) => {
                if (status !== 'SUBSCRIBED') return;
                const identity = _readLocalIdentity();
                try {
                    await _channel.track({
                        user_id: String(userId),
                        name: identity.displayName,
                        avatar_url: identity.avatarUrl || null,
                        online_at: new Date().toISOString()
                    });
                } catch (error) {
                    logger?.warn('supabase:presence', 'track failed:', error?.message || error);
                }
            });

            return true;
        } catch (error) {
            logger?.warn('supabase:presence', 'joinStory failed:', error?.message || error);
            _channel = null;
            _storyId = null;
            _online.clear();
            return false;
        }
    }

    async function leaveStory() {
        const client = _getClient();
        if (_channel && client) {
            try {
                await _channel.untrack();
            } catch {}
            try {
                client.removeChannel(_channel);
            } catch (error) {
                logger?.warn('supabase:presence', 'removeChannel failed:', error?.message || error);
            }
        }
        _channel = null;
        _storyId = null;
        _online.clear();
        _emitPresenceChange();
    }

    function isUserOnline(userId) {
        if (!userId) return false;
        return _online.has(String(userId));
    }

    function getOnlineUserIds() {
        return [..._online.keys()];
    }

    global.SupabasePresence = {
        joinStory,
        leaveStory,
        isUserOnline,
        getOnlineUserIds,
        get activeStoryId() { return _storyId; }
    };

})(window);
