// ============================================
// SUPABASE USER SETTINGS
// ============================================
// Tabla `user_settings`:
//   user_id     uuid  PK (references auth.users.id)
//   font_size   int
//   text_speed  int
//   theme       text  ('light' | 'dark')
//   ui_volume   int   (0-100) → etheria_master_volume
//   rain_volume int   (0-100) → etheria_rain_volume
//
// Flujo: login → loadUserSettings() → aplicar a UI + localStorage
// Cuando un slider cambia → saveUserSettings() persiste en Supabase
// ============================================

const SupabaseSettings = (function () {

    const DEFAULTS = {
        font_size  : 19,
        text_speed : 25,    // valor textSpeed real (no el slider invertido)
        theme      : 'light',
        ui_volume  : 50,
        rain_volume: 30
    };

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _client() { return window.supabaseClient || null; }
    function _isAvailable() { return !!_client(); }

    async function _getUserId() {
        // Fix 6: use global auth cache — avoids network round-trip on every settings save
        if (window._cachedUserId) return window._cachedUserId;
        const sb = _client();
        if (!sb) return null;
        try {
            const { data, error } = await sb.auth.getUser();
            if (error || !data?.user) return null;
            window._cachedUserId = data.user.id;
            return data.user.id;
        } catch { return null; }
    }

    // ── Leer desde localStorage (fuente de verdad local) ────────────────────

    function _readLocal() {
        const rawSpeed = localStorage.getItem('etheria_text_speed');
        const rawSize  = localStorage.getItem('etheria_font_size');
        return {
            font_size  : rawSize  ? parseInt(rawSize,  10) : DEFAULTS.font_size,
            text_speed : rawSpeed ? parseInt(rawSpeed, 10) : DEFAULTS.text_speed,
            theme      : localStorage.getItem('etheria_theme') || DEFAULTS.theme,
            ui_volume  : parseInt(localStorage.getItem('etheria_master_volume') || DEFAULTS.ui_volume,  10),
            rain_volume: parseInt(localStorage.getItem('etheria_rain_volume')   || DEFAULTS.rain_volume, 10)
        };
    }

    // ── Aplicar ajustes a localStorage y sliders/UI ──────────────────────────

    function _applyToUI(settings) {
        const s = Object.assign({}, DEFAULTS, settings);

        // 1. font_size
        localStorage.setItem('etheria_font_size', String(s.font_size));
        document.documentElement.style.setProperty('--font-size-base', s.font_size + 'px');
        const szSlider = document.getElementById('fontSizeSlider') || document.getElementById('optFontSize');
        if (szSlider) szSlider.value = s.font_size;
        const szVal = document.getElementById('optFontSizeVal');
        if (szVal) szVal.textContent = s.font_size + 'px';

        // 2. text_speed  (textSpeed es el valor real; el slider está invertido: slider = 110 - speed)
        localStorage.setItem('etheria_text_speed', String(s.text_speed));
        if (typeof textSpeed !== 'undefined') {
            // eslint-disable-next-line no-undef
            window.textSpeed = s.text_speed;
        }
        const spSlider = document.getElementById('textSpeedSlider') || document.getElementById('optTextSpeed');
        if (spSlider) {
            const sliderVal = 110 - s.text_speed;
            spSlider.value = sliderVal;
            if (typeof syncSpeedLabel === 'function') syncSpeedLabel(sliderVal);
        }

        // 3. theme
        localStorage.setItem('etheria_theme', s.theme);
        document.documentElement.setAttribute('data-theme', s.theme);
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.textContent = s.theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
        if (typeof updateProfileThemeBtn === 'function') updateProfileThemeBtn();

        // 4. ui_volume (master volume)
        localStorage.setItem('etheria_master_volume', String(s.ui_volume));
        if (typeof masterVolume !== 'undefined') {
            window.masterVolume = s.ui_volume / 100 * 0.36;
        }
        const mvSlider = document.getElementById('optMasterVol');
        if (mvSlider) mvSlider.value = s.ui_volume;
        const mvVal = document.getElementById('optMasterVolVal');
        if (mvVal) mvVal.textContent = s.ui_volume + '%';

        // 5. rain_volume
        localStorage.setItem('etheria_rain_volume', String(s.rain_volume));
        const rvSlider = document.getElementById('optRainVol');
        if (rvSlider) rvSlider.value = s.rain_volume;
        const rvVal = document.getElementById('optRainVolVal');
        if (rvVal) rvVal.textContent = s.rain_volume + '%';

        // Notificar para que otros módulos puedan reaccionar
        window.dispatchEvent(new CustomEvent('etheria:settings-applied', { detail: s }));
    }

    // ── API pública ──────────────────────────────────────────────────────────

    /**
     * Carga los ajustes del usuario desde Supabase.
     * Si no existe fila, crea una con los valores actuales del localStorage.
     * Aplica los ajustes cargados a la UI.
     */
    async function loadUserSettings() {
        if (!_isAvailable()) return;
        const userId = await _getUserId();
        if (!userId) return;

        try {
            const { data, error } = await _client()
                .from('user_settings')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) {
                console.error('[SupabaseSettings] loadUserSettings:', error.message);
                return;
            }

            if (data) {
                // Fila existente — aplicar a UI
                _applyToUI(data);
            } else {
                // Primera vez — guardar los valores locales actuales en Supabase
                const local = _readLocal();
                await saveUserSettings(local);
            }
        } catch (err) {
            console.error('[SupabaseSettings] loadUserSettings exception:', err);
        }
    }

    /**
     * Persiste un objeto de ajustes en Supabase (upsert).
     * @param {object} settings  Puede ser parcial — se mezcla con los locales
     */
    async function saveUserSettings(settings) {
        if (!_isAvailable()) return;
        const userId = await _getUserId();
        if (!userId) return;

        const merged = Object.assign(_readLocal(), settings || {});

        const row = {
            user_id    : userId,
            font_size  : Number(merged.font_size)   || DEFAULTS.font_size,
            text_speed : Number(merged.text_speed)  || DEFAULTS.text_speed,
            theme      : String(merged.theme        || DEFAULTS.theme),
            ui_volume  : Number(merged.ui_volume)   || DEFAULTS.ui_volume,
            rain_volume: Number(merged.rain_volume) || DEFAULTS.rain_volume
        };

        try {
            const { error } = await _client()
                .from('user_settings')
                .upsert(row, { onConflict: 'user_id' });

            if (error) {
                console.error('[SupabaseSettings] saveUserSettings:', error.message);
            }
        } catch (err) {
            console.error('[SupabaseSettings] saveUserSettings exception:', err);
        }
    }

    /**
     * Guarda los ajustes actuales (lee de localStorage).
     * Atajo para llamar después de cualquier cambio de slider.
     */
    async function syncCurrentSettings() {
        return saveUserSettings(_readLocal());
    }

    /**
     * Devuelve los ajustes actuales desde localStorage (síncrono).
     */
    function getCurrentSettings() {
        return _readLocal();
    }

    return {
        loadUserSettings,
        saveUserSettings,
        syncCurrentSettings,
        getCurrentSettings
    };

})();

window.SupabaseSettings = SupabaseSettings;
