// Utilidades generales de app: guardado, modales, tema visual y ajustes de lectura.
// UTILIDADES
// ============================================

// ── Salir de la PWA ──────────────────────────────────────────────────────────
// Para el audio, limpia recursos y cierra la ventana (PWA).
// En navegador normal solo para el audio (no puede cerrar la pestaña).
function exitApp() {
    // 1. Parar todo el audio inmediatamente (sin fade)
    eventBus.emit('audio:stop-menu-music', { fadeOut: false });
    eventBus.emit('audio:stop-rain');
    // Suspender AudioContext para liberar recursos del SO
    if (typeof audioCtx !== 'undefined' && audioCtx) {
        try { audioCtx.close(); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }

    // 2. En PWA (standalone) intentar cerrar la ventana
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.matchMedia('(display-mode: fullscreen)').matches  ||
                  navigator.standalone === true;

    if (isPWA) {
        // Pequeña demora para que el fade del audio arranque
        setTimeout(() => {
            try { window.close(); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
            // Fallback si window.close() no funciona (Android Chrome):
            // llevar al usuario a una pantalla en blanco de "cerrado"
            setTimeout(() => {
                document.body.innerHTML =
                    '<div style="display:flex;align-items:center;justify-content:center;' +
                    'height:100vh;background:#1a1815;color:#c9a86c;font-family:serif;' +
                    'flex-direction:column;gap:1rem;text-align:center;">' +
                    '<div style="font-size:2rem;">✦</div>' +
                    '<div style="font-family:Cinzel,serif;letter-spacing:.2em;font-size:.9rem;">ETHERIA</div>' +
                    '<div style="opacity:.5;font-size:.8rem;">Puedes cerrar esta ventana</div>' +
                    '</div>';
            }, 300);
        }, 150);
    }
    // En navegador: solo para el audio, no intentamos cerrar la pestaña
}

function save(opts = {}) {
    const wasUnsaved = hasUnsavedChanges;
    const { silent = false } = opts;

    try {
        // Fix 9: if no partition has been explicitly marked dirty, assume everything
        // changed (backward-compat with legacy call sites that don't yet call markDirty).
        if (typeof _dirtyPartitions !== 'undefined' && _dirtyPartitions.size === 0) {
            _flushAllDirty();
        }
        persistPartitionedData();
        setLocalProfileUpdatedAt(currentUserIndex);
        hasUnsavedChanges = false;
        cloudUnsyncedChanges = true;
        // Informar al motor de sync cloud: hay cambios locales listos para subir.
        if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') {
            SupabaseSync.markPending();
        }
        eventBus.emit('sync:status-changed', { status: 'pending-upload', message: 'Subir cambios',       target: 'button' });
        eventBus.emit('sync:status-changed', { status: 'degraded',       message: 'Pendiente de subida', target: 'indicator' });
        showAutosave('Guardado', 'saved');
        // Solo reproducir sonido en guardados manuales explícitos, no en autoguardado
        if (!silent) eventBus.emit('audio:play-sfx', { sfx: 'save' });
        return true;
    } catch (e) {
        hasUnsavedChanges = wasUnsaved;
        console.error('Error saving:', e);
        showAutosave('Error al guardar: almacenamiento lleno o no disponible', 'error');
        return false;
    }
}


function refreshUIAfterCloudLoad() {
    if (typeof renderTopics === 'function') renderTopics();
    if (typeof renderGallery === 'function') renderGallery();
    if (currentTopicId && typeof showCurrentMessage === 'function') showCurrentMessage();
}

function showAutosave(text, state) {
    const indicator = document.getElementById('autosaveIndicator');
    if (!indicator) return;

    const textEl = indicator.querySelector('.autosave-text');
    const iconEl = indicator.querySelector('.autosave-icon');

    if (textEl) textEl.textContent = text;
    indicator.className = `autosave-indicator visible ${state}`;

    if (iconEl) {
        if (state === 'saved') iconEl.textContent = '🜚';
        else if (state === 'error') iconEl.textContent = '🜄';
        else if (state === 'info') iconEl.textContent = '🜃';
        else iconEl.textContent = '🜂';
    }

    setTimeout(() => {
        indicator.classList.remove('visible');
    }, state === 'error' ? 4000 : 2000);
}

// ── Listeners EventBus para UI pequeña ──────────────────────────────────────
// Los listeners se registran UNA SOLA VEZ al cargar el archivo.
// La guarda _uiListenersReady impide duplicados si el archivo se ejecutara
// más de una vez por algún motivo futuro (hot-reload, tests, etc.).
//
// Payload canónico (ver js/core/events.js para la lista completa):
//   ui:show-autosave    →  { text: string, state: 'saved'|'error'|'info' }
//   ui:show-toast       →  { text: string, action?: string, onAction?: fn }
//   sync:status-changed →  { status, message, target: 'indicator'|'button' }
//
(function _initUIListeners() {
    if (window._uiListenersReady) return;
    window._uiListenersReady = true;

    eventBus.on('ui:show-autosave', function(data) {
        if (data) showAutosave(data.text, data.state);
    });

    eventBus.on('ui:show-toast', function(data) {
        if (data) showSyncToast(data.text, data.action, data.onAction);
    });

    eventBus.on('sync:status-changed', function(data) {
        if (!data) return;
        if (data.target === 'indicator') {
            _updateCloudSyncIndicatorDOM(data.status, data.message);
            // Mostrar el indicador brevemente cuando vuelve a online (absorbido de mejoras.js)
            if (data.status === 'online') _showCloudIndicatorTemporarily();
        }
        if (data.target === 'button') _updateSyncButtonStateDOM(data.status, data.message);
    });

    // Mostrar indicador al arrancar si ya está online
    setTimeout(_showCloudIndicatorTemporarily, 1500);
})();

// Muestra el indicador cloud brevemente cuando el estado es online,
// luego lo oculta. No actúa si el estado es degraded u offline.
var _cloudHideTimer = null;
function _showCloudIndicatorTemporarily() {
    var indicator = document.getElementById('cloudSyncIndicator');
    if (!indicator) return;
    if (indicator.classList.contains('degraded') || indicator.classList.contains('offline')) return;
    indicator.classList.add('visible');
    clearTimeout(_cloudHideTimer);
    _cloudHideTimer = setTimeout(function() {
        indicator.classList.remove('visible');
    }, 3000);
}

// ── Renderizadores de UI de sincronización ───────────────────────────────────
// Solo se llaman desde el listener sync:status-changed.
// Nadie fuera de app-ui.js debe llamarlas directamente.

function _updateCloudSyncIndicatorDOM(status, message) {
    const indicator = document.getElementById('cloudSyncIndicator');
    if (!indicator) return;
    const iconEl = indicator.querySelector('.cloud-sync-icon');
    const textEl = indicator.querySelector('.cloud-sync-text');
    indicator.className = `cloud-sync-indicator ${status}`;
    if (iconEl) {
        if (status === 'online')        iconEl.textContent = '🟢';
        else if (status === 'degraded') iconEl.textContent = '🟠';
        else                            iconEl.textContent = '🔺';
    }
    if (textEl) {
        const fallback = status === 'online' ? 'Conectado' : status === 'degraded' ? 'Cambios pendientes' : 'Offline';
        textEl.textContent = message || fallback;
    }
}

function _updateSyncButtonStateDOM(status, message) {
    const btn = document.getElementById('syncNowBtn');
    if (!btn) return;
    btn.classList.remove('is-synced', 'is-syncing', 'is-upload-pending', 'is-download-pending', 'is-error');
    const icon  = btn.querySelector('.vn-control-icon');
    const label = btn.querySelector('.vn-control-label');

    const SVG_SYNC = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8 a5 5 0 0 1 9-3"/><path d="M13 8 a5 5 0 0 1-9 3"/><polyline points="12,2 12,5 15,5"/><polyline points="4,11 4,14 1,14"/></svg>';
    const SVG_UP   = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="8,3 8,13"/><polyline points="4,7 8,3 12,7"/><line x1="3" y1="13" x2="13" y2="13"/></svg>';
    const SVG_DOWN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="8,13 8,3"/><polyline points="4,9 8,13 12,9"/><line x1="3" y1="3" x2="13" y2="3"/></svg>';
    const SVG_WARN = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 L14.5 13 H1.5 Z"/><line x1="8" y1="6.5" x2="8" y2="10"/><circle cx="8" cy="11.8" r="0.6" fill="currentColor" stroke="none"/></svg>';

    if (status === 'syncing') {
        btn.classList.add('is-syncing');
        if (icon) { icon.innerHTML = SVG_SYNC; btn.style.animation = 'syncSpin 1.2s linear infinite'; }
    } else if (status === 'pending-upload') {
        btn.classList.add('is-upload-pending');
        if (icon) icon.innerHTML = SVG_UP;
        btn.style.animation = '';
    } else if (status === 'pending-download') {
        btn.classList.add('is-download-pending');
        if (icon) icon.innerHTML = SVG_DOWN;
        btn.style.animation = '';
    } else if (status === 'error') {
        btn.classList.add('is-error');
        if (icon) icon.innerHTML = SVG_WARN;
        btn.style.animation = '';
    } else {
        btn.classList.add('is-synced');
        if (icon) icon.innerHTML = SVG_SYNC;
        btn.style.animation = '';
    }
    if (label) label.textContent = message || 'Sincronizar';
}

// Modal de confirmación genérico — reemplaza confirm() nativo
function openConfirmModal(message, okLabel = 'Confirmar') {
    return new Promise((resolve) => {
        const modal     = document.getElementById('confirmModal');
        const titleEl   = document.getElementById('confirmModalTitle');
        const btnOk     = document.getElementById('confirmModalOk');
        const btnCancel = document.getElementById('confirmModalCancel');

        if (!modal || !titleEl || !btnOk || !btnCancel) {
            resolve(confirm(message));
            return;
        }

        titleEl.textContent = message;
        btnOk.textContent = okLabel;

        const cleanup = (result) => {
            modal.classList.remove('active');
            document.body.classList.remove('modal-open');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            resolve(result);
        };
        const onOk     = () => cleanup(true);
        const onCancel = () => cleanup(false);

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        btnOk.focus();
    });
}

function openModal(id) {
    if(id === 'topicModal') {
        // Limpiar el formulario al abrir para que no queden datos del topic anterior
        const titleInput   = document.getElementById('topicTitleInput');
        const firstMsgInput = document.getElementById('topicFirstMsg');
        if (titleInput)    titleInput.value = '';
        if (firstMsgInput) firstMsgInput.value = '';
        if (typeof setTopicWeather === 'function') setTopicWeather('none');
        updateTopicModeUI();
    }
    const modal = document.getElementById(id);
    if (modal) {
        lastFocusedElement = document.activeElement;
        modal.classList.add('active');
        document.body.classList.add('modal-open');

        const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) firstFocusable.focus();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');

    if (id === 'roleCharacterModal' && pendingRoleTopicId) {
        appData.topics = appData.topics.filter(t => t.id !== pendingRoleTopicId);
        delete appData.messages[pendingRoleTopicId];
        pendingRoleTopicId = null;
        hasUnsavedChanges = true;
        save({ silent: true });
        renderTopics();
    }

    const anyModalOpen = document.querySelector('.modal-overlay.active');
    if (!anyModalOpen) {
        document.body.classList.remove('modal-open');
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }
}

function changeUser() {
    const newName = prompt('Nuevo nombre:', userNames[currentUserIndex]);
    if(newName?.trim()) {
        userNames[currentUserIndex] = newName.trim();
        localStorage.setItem('etheria_user_names', JSON.stringify(userNames));

        const currentUserDisplay = document.getElementById('currentUserDisplay');
        if (currentUserDisplay) currentUserDisplay.textContent = newName.trim();

        save({ silent: true });
        renderUserCards();
    }
}

// Propaga el color del personaje activo como variable CSS global
// para que la caja de diálogo y el avatar ring lo reflejen
function normalizeCssColor(input) {
    if (!input || typeof input !== 'string') return null;
    const value = input.trim();
    const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;

    if (HEX.test(value)) {
        const raw = value.slice(1);
        const full = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
        return {
            fullHex: `#${full}`.toLowerCase(),
            rgb: [
                parseInt(full.slice(0, 2), 16),
                parseInt(full.slice(2, 4), 16),
                parseInt(full.slice(4, 6), 16),
            ],
        };
    }

    const rgbMatch = value.match(RGB);
    if (rgbMatch) {
        const rgb = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) => Math.max(0, Math.min(255, parseInt(n, 10))));
        const fullHex = `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
        return { fullHex, rgb };
    }

    return null;
}

function setThemeMetaColor(theme) {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) return;
    metaTheme.setAttribute('content', theme === 'dark' ? '#1a1815' : '#f5f1e8');
}

function applyCharColor(hexColor) {
    const normalized = normalizeCssColor(hexColor || '');
    if (!normalized) {
        document.documentElement.style.setProperty('--char-color', 'rgba(139, 115, 85, 0.6)');
        document.documentElement.style.setProperty('--char-color-full', '#8b7355');
        document.documentElement.style.setProperty('--char-color-rgb', '139, 115, 85');
        return;
    }
    const [r, g, b] = normalized.rgb;
    document.documentElement.style.setProperty('--char-color', `rgba(${r}, ${g}, ${b}, 0.55)`);
    document.documentElement.style.setProperty('--char-color-full', normalized.fullHex);
    document.documentElement.style.setProperty('--char-color-rgb', `${r}, ${g}, ${b}`);
}

function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    setThemeMetaColor(newTheme);
    localStorage.setItem('etheria_theme', newTheme);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
    // Botón menú ajustes: texto descriptivo
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.textContent = newTheme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    // Botón circular perfil: icono del modo actual
    const profileBtn = document.getElementById('profileThemeBtn');
    if (profileBtn) profileBtn.textContent = newTheme === 'dark' ? '🌙' : '☀️';
    generateParticles();
}

function updateProfileThemeBtn() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    setThemeMetaColor(theme);
    // Botón menú ajustes
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    // Botón circular perfil: muestra el icono del modo en que SE ESTÁ actualmente
    const profileBtn = document.getElementById('profileThemeBtn');
    if (profileBtn) profileBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleHaptics(enabled) {
    try { localStorage.setItem('etheria_haptics_enabled', enabled ? '1' : '0'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
}

function updateMasterVolume(val) {
    if (typeof masterVolume !== 'undefined') masterVolume = parseInt(val) / 100 * 0.36;
    localStorage.setItem('etheria_master_volume', val);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
    const el = document.getElementById('optMasterVolVal');
    if (el) el.textContent = val + '%';
}

function updateRainVolume(val) {
    const gain = (parseInt(val) / 100) * 0.08;
    if (typeof rainGainNode !== 'undefined' && rainGainNode && typeof audioCtx !== 'undefined' && audioCtx) {
        try { rainGainNode.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + 0.4); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }
    localStorage.setItem('etheria_rain_volume', val);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
    const el = document.getElementById('optRainVolVal');
    if (el) el.textContent = val + '%';
}

function updateUiSounds(enabled) {
    localStorage.setItem('etheria_ui_sounds', enabled ? '1' : '0');
}

function syncSpeedLabel(val) {
    const el = document.getElementById('optSpeedVal');
    if (!el) return;
    const v = parseInt(val);
    el.textContent = v < 40 ? 'Rápido' : v < 70 ? 'Normal' : 'Lento';
}

function saveProfileNameFromOptions() {
    const input = document.getElementById('optProfileName');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { showAutosave('Escribe un nombre', 'error'); return; }
    userNames[currentUserIndex] = name;
    localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
    const display = document.getElementById('currentUserDisplay');
    if (display) display.textContent = name;
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') {
        SupabaseSync.markPending();
    }
    showAutosave('Nombre actualizado', 'saved');
    // Actualizar initial del avatar si no hay foto
    _syncAvatarInitials();
}

// ── Tab switcher del menú de opciones ────────────────────────────────────
function switchOptTab(tabId, btn) {
    // Desactivar todos
    document.querySelectorAll('.opt-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.opt-panel').forEach(p => p.classList.remove('active'));
    // Activar el elegido
    if (btn) { btn.classList.add('active'); btn.setAttribute('aria-selected', 'true'); }
    const panel = document.getElementById('optPanel-' + tabId);
    if (panel) panel.classList.add('active');
    // Sincronizar perfil al entrar en esa pestaña
    if (tabId === 'profile' || tabId === 'account') _syncProfileTab();
}

// ── Avatar helpers ────────────────────────────────────────────────────────

function _getAvatars() {
    try { return JSON.parse(localStorage.getItem('etheria_user_avatars') || '[]'); } catch { return []; }
}
function _saveAvatars(arr) {
    try { localStorage.setItem('etheria_user_avatars', JSON.stringify(arr)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') SupabaseSync.markPending();
}
function _getGenders() {
    try { return JSON.parse(localStorage.getItem('etheria_user_genders') || '[]'); } catch { return []; }
}
function _saveGenders(arr) {
    try { localStorage.setItem('etheria_user_genders', JSON.stringify(arr)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') SupabaseSync.markPending();
}
function _getBirthdays() {
    try { return JSON.parse(localStorage.getItem('etheria_user_birthdays') || '[]'); } catch { return []; }
}
function _saveBirthdays(arr) {
    try { localStorage.setItem('etheria_user_birthdays', JSON.stringify(arr)); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    if (typeof SupabaseSync !== 'undefined' && typeof SupabaseSync.markPending === 'function') SupabaseSync.markPending();
}

function _getCurrentProfileAvatar() {
    const avatars = _getAvatars();
    return avatars[currentUserIndex] || localStorage.getItem('etheria_cloud_avatar_url') || '';
}

async function _getAuthenticatedUserIdForAvatar() {
    if (window._cachedUserId) return window._cachedUserId;
    if (!window.supabaseClient || typeof window.supabaseClient.auth?.getUser !== 'function') return null;
    try {
        const { data, error } = await window.supabaseClient.auth.getUser();
        if (error || !data?.user?.id) return null;
        window._cachedUserId = data.user.id;
        return data.user.id;
    } catch {
        return null;
    }
}

function _saveAvatarInLocalProfile(url) {
    const avatars = _getAvatars();
    while (avatars.length <= currentUserIndex) avatars.push('');
    avatars[currentUserIndex] = url || '';
    _saveAvatars(avatars);
}

async function _uploadProfileAvatarToCloud(file) {
    const userId = await _getAuthenticatedUserIdForAvatar();
    if (!userId) return { ok: false, error: 'Inicia sesión para sincronizar el avatar en la nube.' };
    if (!window.supabaseClient) return { ok: false, error: 'Supabase no disponible.' };

    const extMatch = (file?.name || '').match(/\.(png|jpg|jpeg|gif|webp)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
    const contentType = file?.type || (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`);
    const path = `${userId}/profile.${ext}`;

    const { error: uploadError } = await window.supabaseClient.storage
        .from('user-avatars')
        .upload(path, file, { upsert: true, contentType });

    if (uploadError) {
        return { ok: false, error: uploadError.message || 'No se pudo subir el avatar a la nube.' };
    }

    const { data: urlData } = window.supabaseClient.storage
        .from('user-avatars')
        .getPublicUrl(path);

    const publicUrl = urlData?.publicUrl || '';
    if (!publicUrl) return { ok: false, error: 'No se pudo obtener la URL pública del avatar.' };

    if (typeof SupabaseSettings !== 'undefined' && typeof SupabaseSettings.saveUserSettings === 'function') {
        await SupabaseSettings.saveUserSettings({ avatar_url: publicUrl });
    }
    localStorage.setItem('etheria_cloud_avatar_url', publicUrl);
    return { ok: true, url: publicUrl };
}

async function _removeProfileAvatarFromCloud() {
    const userId = await _getAuthenticatedUserIdForAvatar();
    if (!userId || !window.supabaseClient) return;

    const paths = ['png', 'jpg', 'jpeg', 'gif', 'webp'].map(ext => `${userId}/profile.${ext}`);
    try { await window.supabaseClient.storage.from('user-avatars').remove(paths); } catch {}
    if (typeof SupabaseSettings !== 'undefined' && typeof SupabaseSettings.saveUserSettings === 'function') {
        await SupabaseSettings.saveUserSettings({ avatar_url: '' });
    }
    localStorage.setItem('etheria_cloud_avatar_url', '');
}

function _syncAvatarInitials() {
    const initEl = document.getElementById('optAvatarInitials');
    if (initEl) initEl.textContent = (userNames[currentUserIndex] || '?')[0].toUpperCase();
}

function _syncProfileTab() {
    // Nombre
    const nameInput = document.getElementById('optProfileName');
    if (nameInput) nameInput.value = userNames[currentUserIndex] || '';
    _syncAvatarInitials();

    // Avatar
    const avatar  = _getCurrentProfileAvatar();
    const imgEl   = document.getElementById('optAvatarImg');
    const removeBtn = document.getElementById('optAvatarRemoveBtn');
    if (imgEl) {
        if (avatar) {
            imgEl.src = avatar;
            imgEl.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            imgEl.src = '';
            imgEl.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    // Género
    const genders = _getGenders();
    const genderSel = document.getElementById('optProfileGender');
    if (genderSel) genderSel.value = genders[currentUserIndex] || '';

    // Cumpleaños
    const birthdays = _getBirthdays();
    const bday = birthdays[currentUserIndex] || '';
    const bdayInput = document.getElementById('optProfileBirthday');
    if (bdayInput) bdayInput.value = bday;
    _updateBirthdayHint(bday);
}

function _updateBirthdayHint(bday) {
    const hint = document.getElementById('optBirthdayHint');
    if (!hint) return;
    if (!bday) { hint.textContent = ''; return; }
    try {
        const [y, m, d] = bday.split('-').map(Number);
        const today = new Date();
        const thisYear = today.getFullYear();
        const next = new Date(thisYear, m - 1, d);
        if (next < today) next.setFullYear(thisYear + 1);
        const diff = Math.round((next - today) / 86400000);
        const age = thisYear - y;
        if (diff === 0) hint.textContent = `🎂 ¡Hoy cumples ${age} años!`;
        else if (diff <= 7) hint.textContent = `🎂 En ${diff} día${diff > 1 ? 's' : ''}`;
        else hint.textContent = `${age} años`;
    } catch { hint.textContent = ''; }
}

async function handleAvatarUpload(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1.2 * 1024 * 1024) {
        showAutosave('La imagen es demasiado grande (máx. 1 MB)', 'error');
        return;
    }

    showAutosave('Guardando avatar...', 'info');
    const userId = await _getAuthenticatedUserIdForAvatar();

    if (userId) {
        const cloud = await _uploadProfileAvatarToCloud(file);
        if (!cloud.ok) {
            showAutosave(cloud.error || 'Error al subir avatar a la nube', 'error');
            input.value = '';
            return;
        }
        _saveAvatarInLocalProfile(cloud.url);
        _syncProfileTab();
        showAutosave('Avatar guardado en la nube', 'saved');
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            _saveAvatarInLocalProfile(data);
            _syncProfileTab();
            showAutosave('Avatar guardado localmente', 'saved');
            if (typeof renderUserCards === 'function') renderUserCards();
        };
        reader.readAsDataURL(file);
        input.value = '';
        return;
    }

    if (typeof renderUserCards === 'function') renderUserCards();
    input.value = '';
}

async function removeProfileAvatar() {
    _saveAvatarInLocalProfile('');
    await _removeProfileAvatarFromCloud();
    _syncProfileTab();
    showAutosave('Avatar eliminado', 'saved');
    if (typeof renderUserCards === 'function') renderUserCards();
}

function saveProfileGender(value) {
    const genders = _getGenders();
    while (genders.length <= currentUserIndex) genders.push('');
    genders[currentUserIndex] = value;
    _saveGenders(genders);
    if (typeof renderUserCards === 'function') renderUserCards();
}

function saveProfileBirthday(value) {
    const birthdays = _getBirthdays();
    while (birthdays.length <= currentUserIndex) birthdays.push('');
    birthdays[currentUserIndex] = value;
    _saveBirthdays(birthdays);
    _updateBirthdayHint(value);
    if (typeof renderUserCards === 'function') renderUserCards();
}

function syncOptionsSection() {
    const savedSpeed = localStorage.getItem('etheria_text_speed');
    const savedSize  = localStorage.getItem('etheria_font_size');
    const savedMasterVol = parseInt(localStorage.getItem('etheria_master_volume') || '50');
    const savedRainVol   = parseInt(localStorage.getItem('etheria_rain_volume') || '30');
    const uiSounds = localStorage.getItem('etheria_ui_sounds') !== '0';
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    const speedSlider  = document.getElementById('optTextSpeed');
    const sizeSlider   = document.getElementById('optFontSize');
    const masterSlider = document.getElementById('optMasterVol');
    const rainSlider   = document.getElementById('optRainVol');
    const uiCheck  = document.getElementById('optUiSounds');
    const themeBtn = document.getElementById('themeToggleBtn');
    const nameInput = document.getElementById('optProfileName');
    const immersiveCheck = document.getElementById('optImmersiveMode');
    const hapticCheck = document.getElementById('hapticToggle');
    const continuousCheck = document.getElementById('optContinuousRead');
    const continuousDelay = document.getElementById('optContinuousDelay');

    if (speedSlider && savedSpeed) {
        const sliderVal = 110 - parseInt(savedSpeed);
        speedSlider.value = sliderVal;
        syncSpeedLabel(sliderVal);
    }
    if (sizeSlider && savedSize) {
        sizeSlider.value = savedSize;
        const valEl = document.getElementById('optFontSizeVal');
        if (valEl) valEl.textContent = savedSize + 'px';
    }
    if (masterSlider) { masterSlider.value = savedMasterVol; const mvEl = document.getElementById('optMasterVolVal'); if (mvEl) mvEl.textContent = savedMasterVol + '%'; }
    if (rainSlider)   { rainSlider.value = savedRainVol;     const rvEl = document.getElementById('optRainVolVal');   if (rvEl) rvEl.textContent = savedRainVol   + '%'; }
    if (uiCheck)  uiCheck.checked = uiSounds;
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    if (nameInput) nameInput.value = userNames[currentUserIndex] || '';
    if (immersiveCheck) immersiveCheck.checked = localStorage.getItem('etheria_immersive_mode') === '1';
    if (hapticCheck) hapticCheck.checked = localStorage.getItem('etheria_haptics_enabled') !== '0';
    const savedContinuous = localStorage.getItem('etheria_continuous_read') === '1';
    const savedContinuousDelay = Math.max(3, Math.min(5, Number(localStorage.getItem('etheria_continuous_delay') || 4)));
    if (continuousCheck) continuousCheck.checked = savedContinuous;
    if (continuousDelay) continuousDelay.value = savedContinuousDelay;
    const continuousDelayLabel = document.getElementById('optContinuousDelayVal');
    if (continuousDelayLabel) continuousDelayLabel.textContent = `${savedContinuousDelay}s`;

    const statsEl = document.getElementById('optProfileStats');
    if (statsEl) {
        const myTopics = appData.topics.filter(t => t.createdByIndex === currentUserIndex).length;
        const myChars  = appData.characters.filter(c => c.userIndex === currentUserIndex).length;
        statsEl.textContent = `${myTopics} historias · ${myChars} personajes`;
    }
    // Sincronizar pestaña de perfil siempre que se abra opciones
    _syncProfileTab();
}

function deleteCurrentTopic() {
    openConfirmModal('¿Borrar esta historia? Esta acción no se puede deshacer.', 'Borrar').then(ok => {
        if (!ok) return;
        appData.topics = appData.topics.filter(t => t.id !== currentTopicId);
        delete appData.messages[currentTopicId];
        delete appData.affinities[currentTopicId];
        currentTopicId = null;
        hasUnsavedChanges = true;
        save({ silent: true });
        // Marcar como sin cambios pendientes para que backToTopics no pregunte
        // (el guardado ya ocurrió o falló, pero el topic ya no existe en memoria)
        hasUnsavedChanges = false;
        backToTopics();
    });
}

async function manualSyncFromScene() {
    if (hasUnsavedChanges) save({ silent: true });
    await syncBidirectional({ silent: false, allowRemotePrompt: true });
}

function quickSave() {
    const saved = save();
    showAutosave(saved ? 'Guardado rápido' : 'Error al guardar rápido', saved ? 'saved' : 'error');
}

function openSaveHubModal() {
    openModal('saveHubModal');
    // Notificar a Ethy
    window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'saveHub' } }));
}

function saveGameFromMenu() {
    // Recopilar mensajes de todos los topics para el archivo completo
    const allMessages = {};
    appData.topics.forEach(t => {
        allMessages[t.id] = getTopicMessages(t.id);
    });

    const exportPayload = {
        version: 2,
        exportedAt: new Date().toISOString(),
        profileName: userNames[currentUserIndex] || 'Jugador',
        topics: appData.topics,
        characters: appData.characters,
        messages: allMessages,
        affinities: appData.affinities
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const safeName = (userNames[currentUserIndex] || 'partida').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    a.href = URL.createObjectURL(blob);
    a.download = `etheria_${safeName}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    showAutosave('Archivo de guardado descargado', 'saved');
    eventBus.emit('audio:play-sfx', { sfx: 'save' });
}

function loadGameFromMenu() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = event => {
            try {
                const data = JSON.parse(event.target.result);
                validateImportedData(data);

                const profileInfo = data.profileName ? ` (perfil: ${data.profileName})` : '';
                const exportDate = data.exportedAt ? ` · guardado el ${new Date(data.exportedAt).toLocaleString()}` : '';
                const msg = `¿Cargar el archivo${profileInfo}${exportDate}? Esto reemplazará todos los datos actuales.`;

                openConfirmModal(msg, 'Cargar').then(ok => {
                    if (!ok) return;
                    appData.topics     = Array.isArray(data.topics)     ? data.topics     : [];
                    appData.characters = Array.isArray(data.characters) ? data.characters : [];
                    appData.messages   = (data.messages   && typeof data.messages   === 'object' && !Array.isArray(data.messages))   ? data.messages   : {};
                    appData.affinities = (data.affinities && typeof data.affinities === 'object' && !Array.isArray(data.affinities)) ? data.affinities : {};

                    hasUnsavedChanges = true;
                    save({ silent: true });
                    showAutosave('Partida cargada correctamente', 'saved');
                    renderTopics();
                    renderGallery();
                });
            } catch (err) {
                showAutosave('Error al cargar el archivo: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}



function _storyCodeStorageKey(code) {
    return `etheria_story_code_${code}`;
}

const STORY_CODE_BLOCKLIST = new Set(['PUTO', 'CACA', 'KKK']);

function _generateStoryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    do {
        out = '';
        for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    } while (STORY_CODE_BLOCKLIST.has(out));
    return out;
}

function _drawStoryCodeQr(code) {
    const canvas = document.getElementById('storyCodeQrCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 22;
    const cell = Math.floor(canvas.width / size);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let seed = 0;
    for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const v = (x * 73856093) ^ (y * 19349663) ^ seed;
            const on = ((v >>> 2) & 1) === 1 || x < 2 || y < 2 || x > size - 3 || y > size - 3;
            if (on) {
                ctx.fillStyle = '#111';
                ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
            }
        }
    }
}

function _lzCompress(str) {
    // Compresión simple run-length para reducir tamaño del código exportado
    try {
        // Intentar usar CompressionStream si está disponible (navegadores modernos)
        return str; // fallback: sin compresión adicional (btoa ya es suficiente)
    } catch { return str; }
}

function _trimMessagesForExport(messages) {
    // Recortar a los últimos 200 mensajes para no sobrepasar localStorage (~5MB)
    const MAX = 200;
    if (!Array.isArray(messages)) return [];
    const msgs = messages.slice(-MAX);
    // Eliminar campos pesados opcionales que se pueden reconstruir
    return msgs.map(m => {
        const out = { ...m };
        // charSprite puede ser una URL muy larga - conservar solo si es corta
        if (out.charSprite && out.charSprite.length > 300) delete out.charSprite;
        return out;
    });
}

function exportCurrentStoryAsCode() {
    if (!currentTopicId) {
        showAutosave('Abre una historia primero', 'error');
        return;
    }
    const topic = appData.topics.find(t => String(t.id) === String(currentTopicId));
    if (!topic) return;

    const messages = _trimMessagesForExport(getTopicMessages(currentTopicId));

    // Solo incluir personajes que aparecen en esta historia
    const charIdsInTopic = new Set(messages.map(m => m.characterId).filter(Boolean));
    const relevantChars = appData.characters.filter(c => charIdsInTopic.has(c.id));

    // Clonar topic sin campos de caché que engordan el payload
    const topicClean = { ...topic };
    delete topicClean._cachedMessages;

    const payload = {
        v: 2,
        topic: topicClean,
        messages,
        chars: relevantChars
    };

    const serialized = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const kb = Math.round(serialized.length / 1024);
    if (kb > 4000) {
        showAutosave(`Historia muy grande (${kb}KB). Solo se exportarán los últimos 200 mensajes.`, 'error');
    }
    let code = _generateStoryCode();
    let retries = 0;
    while (localStorage.getItem(_storyCodeStorageKey(code)) && retries < 10) {
        code = _generateStoryCode();
        retries++;
    }
    try {
        localStorage.setItem(_storyCodeStorageKey(code), serialized);
        localStorage.setItem('etheria_last_story_code', code);
    } catch (e) {
        showAutosave('No se pudo guardar el código: almacenamiento lleno', 'error');
        return;
    }

    const codeEl = document.getElementById('storyCodeValue');
    if (codeEl) codeEl.textContent = code;
    _drawStoryCodeQr(code);
    openModal('storyCodeModal');
    showAutosave('Código de historia generado', 'saved');
}

function importStoryFromCode() {
    const code = (window.prompt('Introduce el código de 6 caracteres:') || '').trim().toUpperCase();
    if (!code) return;
    const raw = localStorage.getItem(_storyCodeStorageKey(code));
    if (!raw) {
        showAutosave('Código no encontrado en este dispositivo', 'error');
        return;
    }

    try {
        const payload = JSON.parse(decodeURIComponent(escape(atob(raw))));
        if (!payload || !payload.topic) throw new Error('Payload inválido');

        const importedTopic = { ...payload.topic, id: `${payload.topic.id}_${Date.now()}` };
        appData.topics.push(importedTopic);
        appData.messages[importedTopic.id] = Array.isArray(payload.messages) ? payload.messages.map((m) => ({ ...m, id: `${m.id}_${Math.random().toString(16).slice(2)}` })) : [];

        if (Array.isArray(payload.chars)) {
            const known = new Set(appData.characters.map(c => String(c.id)));
            payload.chars.forEach((c) => {
                if (!known.has(String(c.id))) appData.characters.push(c);
            });
        }

        hasUnsavedChanges = true;
        save({ silent: true });
        renderTopics();
        showAutosave('Historia importada desde código', 'saved');
    } catch (err) {
        showAutosave('No se pudo importar el código', 'error');
    }
}

function exportData() {
    const blob = new Blob([JSON.stringify(appData, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `etheria_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

function deleteCharFromModal() {
    const id = document.getElementById('editCharacterId')?.value;
    if(!id) return;

    openConfirmModal('¿Borrar este personaje? Esta acción no se puede deshacer.', 'Borrar').then(ok => {
        if (!ok) return;
        if (selectedCharId === id) {
            selectedCharId = null;
            localStorage.removeItem(`etheria_selected_char_${currentUserIndex}`);
        }
        appData.characters = appData.characters.filter(c => c.id !== id);
        hasUnsavedChanges = true;
        save({ silent: true });
        closeModal('characterModal');
        resetCharForm();
        renderGallery();
    });
}

let immersiveUiHideTimer = null;
let immersiveUiShowTimer = null;
const IMMERSIVE_REVEAL_DELAY = 200;
const IMMERSIVE_HIDE_AFTER_MS = 3000;

function toggleImmersiveModeSetting(enabled) {
    const active = !!enabled;
    try { localStorage.setItem('etheria_immersive_mode', active ? '1' : '0'); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    document.body.classList.toggle('immersive-mode', active);
    if (active) revealImmersiveUiTemporarily();
}

function revealImmersiveUiTemporarily() {
    if (!document.body.classList.contains('immersive-mode')) return;
    const vnSection = document.getElementById('vnSection');
    if (!vnSection || !vnSection.classList.contains('active')) return;

    if (immersiveUiShowTimer) clearTimeout(immersiveUiShowTimer);
    immersiveUiShowTimer = setTimeout(() => {
        document.body.classList.add('immersive-reveal');
    }, IMMERSIVE_REVEAL_DELAY);

    if (immersiveUiHideTimer) clearTimeout(immersiveUiHideTimer);
    immersiveUiHideTimer = setTimeout(() => {
        document.body.classList.remove('immersive-reveal');
    }, IMMERSIVE_HIDE_AFTER_MS);
}

// ============================================
// AJUSTES
// ============================================
function openSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.add('active');
}

function closeSettings() {
    const panel = document.getElementById('settingsPanel');
    if (panel) panel.classList.remove('active');
}

function updateTextSpeed(val) {
    textSpeed = 110 - parseInt(val);
    localStorage.setItem('etheria_text_speed', textSpeed);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});

    const speedValue = document.getElementById('speedValue');
    if (speedValue) {
        const labels = ['Rápido', 'Normal', 'Lento'];
        const idx = val < 40 ? 0 : val < 70 ? 1 : 2;
        speedValue.textContent = labels[idx];
    }
}

function updateFontSize(val) {
    document.documentElement.style.setProperty('--font-size-base', val + 'px');
    localStorage.setItem('etheria_font_size', val);
    if (typeof SupabaseSettings !== 'undefined') SupabaseSettings.syncCurrentSettings().catch(() => {});
}

function setAtmosphere(filter, element) {
    const vnSection = document.getElementById('vnSection');
    if (!vnSection) return;

    vnSection.classList.remove('sepia', 'bw', 'cinematic');
    if (filter !== 'none') vnSection.classList.add(filter);

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btn = element || document.querySelector(`.filter-btn[onclick*="'${filter}'"]`);
    if (btn) btn.classList.add('active');
}

// ── ONBOARDING PRIMER ACCESO ──────────────────────────────
const _ONBOARDING_KEY = 'etheria_onboarding_done';

const _ONBOARDING_MESSAGES = [
    'Bienvenida a Etheria.\n\nElige un perfil para comenzar. Cada perfil guarda tu propio universo de historias y personajes, completamente separado del de los demás.',
    'Aquí encontrarás tus historias en curso.\n\nPuedes crear nuevas, retomar las existentes o explorar lo que han escrito otros. Todo a tu ritmo.',
    'Cuando estés dentro de una historia, pulsa en la caja de diálogo para avanzar.\n\nUsa el botón "Responder" para añadir tu voz a la narrativa.'
];

function maybeShowOnboarding() {
    if (localStorage.getItem(_ONBOARDING_KEY)) return;
    const step = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    if (step >= _ONBOARDING_MESSAGES.length) {
        localStorage.setItem(_ONBOARDING_KEY, '1');
        return;
    }
    const overlay = document.getElementById('onboardingOverlay');
    const textEl  = document.getElementById('onboardingText');
    if (!overlay || !textEl) return;
    textEl.textContent = _ONBOARDING_MESSAGES[step];
    overlay.style.display = 'flex';
}

function closeOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.style.display = 'none';
    const step = parseInt(localStorage.getItem('etheria_onboarding_step') || '0', 10);
    const next = step + 1;
    if (next >= _ONBOARDING_MESSAGES.length) {
        localStorage.setItem(_ONBOARDING_KEY, '1');
    } else {
        localStorage.setItem('etheria_onboarding_step', String(next));
    }
}


function syncMenuProfileHint() {
    const hint = document.getElementById('menuProfileHint');
    if (!hint) return;
    const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer:fine)').matches;
    hint.textContent = isDesktop ? 'Haz clic para editar perfil' : 'Toca para editar perfil';
}

function applyPersistedImmersiveMode() {
    const enabled = localStorage.getItem('etheria_immersive_mode') === '1';
    document.body.classList.toggle('immersive-mode', enabled);
}

if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        applyPersistedImmersiveMode();
        syncMenuProfileHint();
    });
    window.addEventListener('resize', syncMenuProfileHint, { passive: true });
}

// ══════════════════════════════════════════════════════════════════════════
// MODAL DE PERFIL RÁPIDO — acceso directo desde el menú principal
// ══════════════════════════════════════════════════════════════════════════

function openProfileModal() {
    _syncProfileModal();
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('active');
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('active');
}

function _syncProfileModal() {
    const name     = userNames[currentUserIndex] || '';
    const genders  = _getGenders();
    const birthdays = _getBirthdays();
    const avatar   = _getCurrentProfileAvatar();

    // Nombre
    const nameInput = document.getElementById('pmName');
    if (nameInput) nameInput.value = name;

    // Initial
    const initEl = document.getElementById('pmInitial');
    if (initEl) initEl.textContent = (name || '?')[0].toUpperCase();

    // Avatar
    const imgEl     = document.getElementById('pmAvatarImg');
    const removeBtn = document.getElementById('pmRemoveAvatar');
    if (imgEl) {
        if (avatar) {
            imgEl.src = avatar;
            imgEl.style.display = 'block';
            if (removeBtn) removeBtn.style.display = 'inline-block';
        } else {
            imgEl.src = '';
            imgEl.style.display = 'none';
            if (removeBtn) removeBtn.style.display = 'none';
        }
    }

    // Género
    const genderSel = document.getElementById('pmGender');
    if (genderSel) genderSel.value = genders[currentUserIndex] || '';

    // Cumpleaños
    const bdayInput = document.getElementById('pmBirthday');
    if (bdayInput) bdayInput.value = birthdays[currentUserIndex] || '';

    // Sincronizar también el avatar del footer
    syncMenuFooterAvatar();
}

function saveProfileModalName() {
    const input = document.getElementById('pmName');
    if (!input) return;
    const name = input.value.trim();
    if (!name) { showAutosave('Escribe un nombre', 'error'); return; }
    userNames[currentUserIndex] = name;
    localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
    const display = document.getElementById('currentUserDisplay');
    if (display) display.textContent = name;
    showAutosave('Nombre actualizado', 'saved');
    // Actualizar initial en el modal y en el footer
    const initEl = document.getElementById('pmInitial');
    if (initEl) initEl.textContent = name[0].toUpperCase();
    syncMenuFooterAvatar();
    if (typeof renderUserCards === 'function') renderUserCards();
    // Sync opt panel also if open
    const optName = document.getElementById('optProfileName');
    if (optName) optName.value = name;
    _syncAvatarInitials();
}

async function handleProfileModalAvatar(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1.2 * 1024 * 1024) {
        showAutosave('La imagen es demasiado grande (máx. 1 MB)', 'error');
        return;
    }

    showAutosave('Guardando avatar...', 'info');
    const userId = await _getAuthenticatedUserIdForAvatar();

    if (userId) {
        const cloud = await _uploadProfileAvatarToCloud(file);
        if (!cloud.ok) {
            showAutosave(cloud.error || 'Error al subir avatar a la nube', 'error');
            input.value = '';
            return;
        }
        _saveAvatarInLocalProfile(cloud.url);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            _saveAvatarInLocalProfile(data);
            _syncProfileModal();
            _syncProfileTab();
            showAutosave('Avatar guardado localmente', 'saved');
            if (typeof renderUserCards === 'function') renderUserCards();
        };
        reader.readAsDataURL(file);
        input.value = '';
        return;
    }

    _syncProfileModal();
    _syncProfileTab();
    showAutosave('Avatar guardado en la nube', 'saved');
    if (typeof renderUserCards === 'function') renderUserCards();
    input.value = '';
}

async function removeProfileModalAvatar() {
    _saveAvatarInLocalProfile('');
    await _removeProfileAvatarFromCloud();
    _syncProfileModal();
    _syncProfileTab();
    showAutosave('Avatar eliminado', 'saved');
    if (typeof renderUserCards === 'function') renderUserCards();
}

// Sincroniza el mini-avatar del footer con los datos actuales del perfil
function syncMenuFooterAvatar() {
    const name    = userNames[currentUserIndex] || '?';
    const avatar  = _getCurrentProfileAvatar();

    // Nombre en el footer
    const nameEl = document.getElementById('currentUserDisplay');
    if (nameEl) nameEl.textContent = name;
    syncMenuProfileHint();

    // Initial en el footer
    const initEl = document.getElementById('menuProfileInitial');
    if (initEl) initEl.textContent = name[0].toUpperCase();

    // Imagen en el footer
    const imgEl = document.getElementById('menuProfileImg');
    if (imgEl) {
        if (avatar) {
            imgEl.src = avatar;
            imgEl.style.display = 'block';
        } else {
            imgEl.src = '';
            imgEl.style.display = 'none';
        }
    }
}
