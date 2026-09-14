// Sistema de sonido ambiental y efectos de audio.
// Todos los sonidos se generan con la Web Audio API (sin archivos externos).
// El volumen general es muy bajo — sirven como apoyo sutil, no protagonistas.

let audioCtx = null;
let rainGainNode = null;
let rainSourceNode = null;
let masterVolume = 0.18; // Volumen general: muy sutil

function getAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            return null;
        }
    }
    // Reanudar si el navegador lo pausó por política de autoplay
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
}

// ============================================
// EFECTOS DE UI (clicks, afinidad, etc.)
// ============================================

// Click suave al avanzar diálogo
function playSoundClick() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(580, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(masterVolume * 0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
}

// Tap corto para botones UI (más discreto que el click de diálogo)
function playSoundTap() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(640, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(masterVolume * 0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.06);
}

// Subir afinidad: nota ascendente cálida
function playSoundAffinityUp() {
    const ctx = getAudioContext();
    if (!ctx) return;

    [523, 659, 784].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const t = ctx.currentTime + i * 0.07;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(masterVolume * 0.45, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.start(t);
        osc.stop(t + 0.25);
    });
}

// Bajar afinidad: nota descendente fría
function playSoundAffinityDown() {
    const ctx = getAudioContext();
    if (!ctx) return;

    [440, 349, 262].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const t = ctx.currentTime + i * 0.07;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(masterVolume * 0.35, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

        osc.start(t);
        osc.stop(t + 0.22);
    });
}

// Guardar: campana suave
function playSoundSave() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.35);

    gain.gain.setValueAtTime(masterVolume * 0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
}

// Notificación de turno: campana ascendente de dos notas (E5 → C5)
function playSoundNotification() {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Primera nota: E5 (659 Hz) — breve y suave
    const osc1  = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659, ctx.currentTime);
    gain1.gain.setValueAtTime(masterVolume * 0.45, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.25);

    // Segunda nota: C5 (523 Hz) — comienza ligeramente después, más larga
    const osc2  = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523, ctx.currentTime + 0.18);
    gain2.gain.setValueAtTime(0.001, ctx.currentTime + 0.18);
    gain2.gain.linearRampToValueAtTime(masterVolume * 0.38, ctx.currentTime + 0.25);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    osc2.start(ctx.currentTime + 0.18);
    osc2.stop(ctx.currentTime + 0.7);
}

// ============================================
// VOZ DE DIÁLOGO (blips sintetizados estilo Animal Crossing / Undertale)
// No son voces reales — un "chirrido" corto por cada palabra/letra que
// se revela en el typewriter, con timbre distinto según el género del
// personaje. Puramente sintético: sin archivos de audio ni licencias.
// ============================================

const DIALOGUE_VOICES = {
    femenino:    { waveform: 'sine',     base: 470, range: 150, dur: 0.045, gain: 0.42 },
    masculino:   { waveform: 'sawtooth', base: 140, range: 70,  dur: 0.055, gain: 0.30 },
    'no binario':{ waveform: 'triangle', base: 300, range: 120, dur: 0.05,  gain: 0.38 },
    default:     { waveform: 'triangle', base: 340, range: 90,  dur: 0.045, gain: 0.32 }
};

function _dialogueVoiceProfile(gender) {
    const key = String(gender || '').trim().toLowerCase();
    if (key === 'femenino') return DIALOGUE_VOICES.femenino;
    if (key === 'masculino') return DIALOGUE_VOICES.masculino;
    if (key === 'no binario' || key === 'no-binario' || key === 'otro') return DIALOGUE_VOICES['no binario'];
    return DIALOGUE_VOICES.default;
}

// blipSeed: primer carácter del token revelado — da variación de tono
// consistente por letra (como en Animal Crossing) en vez de ruido puro.
function playDialogueBlip(gender, blipSeed) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const profile = _dialogueVoiceProfile(gender);
    const code = blipSeed ? blipSeed.charCodeAt(0) : Math.floor(Math.random() * 90);
    const freq = profile.base + (code % 10) / 10 * profile.range;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = profile.waveform;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.82, ctx.currentTime + profile.dur);

    gain.gain.setValueAtTime(masterVolume * profile.gain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + profile.dur);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + profile.dur + 0.01);
}

// ============================================
// SONIDO AMBIENTAL: LLUVIA
// ============================================

function startRainSound() {
    const ctx = getAudioContext();
    if (!ctx || rainSourceNode) return; // ya está sonando

    // Ruido blanco filtrado = lluvia
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    rainSourceNode = ctx.createBufferSource();
    rainSourceNode.buffer = buffer;
    rainSourceNode.loop = true;

    // Filtro paso-banda: frecuencia más baja = lluvia lejana sobre techo
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.35;

    // Filtro de graves muy suave
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowshelf';
    lowFilter.frequency.value = 150;
    lowFilter.gain.value = 1.5;

    rainGainNode = ctx.createGain();
    rainGainNode.gain.setValueAtTime(0, ctx.currentTime);
    // Volumen muy sutil: 0.12 del master — sonido de fondo, apenas perceptible
    rainGainNode.gain.linearRampToValueAtTime(masterVolume * 0.12, ctx.currentTime + 3.5);

    rainSourceNode.connect(filter);
    filter.connect(lowFilter);
    lowFilter.connect(rainGainNode);
    rainGainNode.connect(ctx.destination);

    rainSourceNode.start();
}

function stopRainSound() {
    if (!rainGainNode || !rainSourceNode) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    rainGainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
    const srcToStop = rainSourceNode;
    setTimeout(() => {
        try { srcToStop.stop(); } catch (error) { window.EtheriaLogger?.warn('app', 'operation failed:', error?.message || error); }
    }, 1600);

    rainSourceNode = null;
    rainGainNode = null;
}

// Nota: la integración con setWeather está en effects.js directamente.
// playSoundSave, playSoundClick, playSoundAffinityUp/Down
// se llaman desde app-ui.js, vn.js y roleplay.js respectivamente.

// ============================================
// MELODÍA DEL MENÚ PRINCIPAL — caja de música
// Generada íntegramente con Web Audio API. El tema cambia según la
// atmósfera activa (amanecer/mediodía/atardecer/noche) — ver atmosphere.js.
// ============================================

let _menuMusicNodes = [];
let _menuMusicPlaying = false;
let _menuMusicScheduleId = null;
let _menuMusicGain = null;
let _menuMusicAtmosphere = null;

function _getActiveAtmosphere() {
    return (window.EtheriaAtmosphere && window.EtheriaAtmosphere.get()) || 'noche';
}

// Tabla de frecuencias compartida por todos los temas
const _MENU_NOTE_FREQS = {
    REST: 0,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, Ab3: 207.65, A3: 220.00, Bb3: 233.08, B3: 246.94,
    C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23, G4: 392.00, Ab4: 415.30, A4: 440.00, Bb4: 466.16, B4: 493.88,
    C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99, Ab5: 830.61, A5: 880.00
};

// Un tema por atmósfera: escala, tempo (segundos/beat) y color tímbrico propios.
// Inspirado en las dungeons de los Zelda clásicos — misterio, no aventura:
// modos frigio/dórico/eólico en vez de mayor, bajos que insisten más que
// "acompañan" y frases de campana espaciadas con silencio de por medio.
// "atardecer" ya tenía ese aire y se deja tal cual; el resto se reescribe
// para ir en esa misma dirección.
const _MENU_THEMES = {
    // Mi eólica (misteriosa pero abierta) — bajo lento tipo pad, frases
    // suspendidas con mucho aire entre ellas. La más "quieta" de las cuatro.
    amanecer: {
        beat: 0.62, melodyVol: 0.085, melodyFilter: 2200, bassVol: 0.035, bassFilter: 500,
        melody: [
            ['REST',2],['A4',1.5],['C5',1],['B4',1],['REST',2],
            ['G4',1],['A4',1],['C5',1.5],['REST',1.5],
            ['E4',2],['F4',1],['G4',1],['A4',2],['REST',2],
            ['B4',1],['A4',1],['G4',1],['E4',3],['REST',3],
        ],
        bass: [['A3',3],['E3',3],['F3',3],['C3',3],['G3',3],['A3',6]],
    },
    // Re dórico — la menos oscura de las cuatro, pero sigue sin ser "alegre":
    // un pulso de bajo moderado sostiene frases de campana más móviles.
    mediodia: {
        beat: 0.55, melodyVol: 0.085, melodyFilter: 2600, bassVol: 0.045, bassFilter: 650,
        melody: [
            ['D4',1],['F4',1],['G4',1],['A4',1.5],['REST',1.5],
            ['C5',1],['B4',1],['A4',1],['G4',1.5],['REST',1],
            ['F4',1],['G4',1],['A4',1],['D5',1.5],['C5',1],['REST',1.5],
            ['B4',1],['A4',1],['G4',1],['F4',1],['D4',2],['REST',2],
        ],
        bass: [['D3',2],['A3',2],['C3',2],['G3',2],['D3',2],['F3',2],['A3',2],['D3',4]],
    },
    atardecer: {
        beat: 1.05, melodyVol: 0.075, melodyFilter: 1500, bassVol: 0.045, bassFilter: 550,
        melody: [
            ['G4',1],['F4',0.5],['Eb4',0.5],['D4',1],['C4',1],['REST',1],
            ['Eb4',0.5],['D4',0.5],['C4',1],['Bb3',1],
            ['Ab4',0.5],['G4',0.5],['F4',1],['Eb4',1],['REST',1],
            ['D4',0.5],['C4',0.5],['Bb3',1],['G3',2],['REST',1.5],
        ],
        bass: [['C3',4],['Ab3',2],['Bb3',2],['F3',4],['C3',4],['G3',4]],
    },
    // Mi frigio — el b2 (F contra la tónica Mi) es la tensión característica
    // de las dungeons clásicas. Bajo en pulso insistente tipo "latido",
    // campanas espaciadas por encima. La más oscura de las cuatro.
    noche: {
        beat: 0.42, melodyVol: 0.09, melodyFilter: 1600, bassVol: 0.055, bassFilter: 480,
        melody: [
            ['REST',3],['E4',2],['F4',1],['E4',1],['REST',2],
            ['G4',2],['F4',1],['E4',2],['REST',3],
            ['C5',2],['B4',1],['A4',1],['G4',2],['F4',2],['REST',2],
            ['E4',3],['D4',1],['E4',4],['REST',4],
        ],
        bass: [
            ['E3',1],['E3',1],['E3',1],['E3',1],
            ['E3',1],['E3',1],['F3',1],['E3',1],
            ['E3',1],['E3',1],['E3',1],['E3',1],
            ['D3',1],['E3',1],['E3',1],['REST',1],
        ],
    },
};

// Nota tipo "caja de música": ataque casi instantáneo + decaimiento
// exponencial rápido en triangle, más un armónico metálico a una relación
// NO entera (x3.017) que decae aún más rápido — es lo que da el "plink"
// característico de las tinas de un music box en vez de un synth sostenido.
function _playMusicBoxNote(ctx, masterGain, freq, startTime, duration, opts) {
    if (!freq || freq === 0) return; // REST
    const o = opts || {};
    const vol        = o.vol        != null ? o.vol        : 0.085;
    const filterFreq = o.filterFreq != null ? o.filterFreq : 2800;
    const attack     = 0.004;
    const decay       = Math.min(duration, duration * 0.85);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.7;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + attack);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + decay);

    osc.start(startTime);
    osc.stop(startTime + decay + 0.05);

    // Tine metálico — relación inarmónica deliberada, decae en una fracción
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 3.017, startTime);
    gain2.gain.setValueAtTime(0, startTime);
    gain2.gain.linearRampToValueAtTime(vol * 0.28, startTime + attack);
    gain2.gain.exponentialRampToValueAtTime(0.0006, startTime + decay * 0.4);
    osc2.start(startTime);
    osc2.stop(startTime + decay * 0.4 + 0.03);

    _menuMusicNodes.push(osc, gain, filter, osc2, gain2);
}

// Bajo suave — pad de sostén bajo la caja de música, sin protagonismo
function _playMenuBassNote(ctx, masterGain, freq, startTime, duration, opts) {
    if (!freq || freq === 0) return; // REST
    const o = opts || {};
    const vol        = o.vol        != null ? o.vol        : 0.045;
    const filterFreq = o.filterFreq != null ? o.filterFreq : 650;
    const attack  = 0.03;
    const release = Math.min(duration * 0.5, 0.3);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + attack);
    gain.gain.setValueAtTime(vol, startTime + duration - release);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    _menuMusicNodes.push(osc, gain, filter);
}

function startMenuMusic(forceAtmosphere) {
    if (_menuMusicPlaying) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    _menuMusicPlaying = true;
    _menuMusicNodes = [];
    _menuMusicAtmosphere = forceAtmosphere || _getActiveAtmosphere();

    // Nodo master de la música — fade in suave
    _menuMusicGain = ctx.createGain();
    _menuMusicGain.gain.setValueAtTime(0, ctx.currentTime);
    _menuMusicGain.gain.linearRampToValueAtTime(masterVolume * 0.55, ctx.currentTime + 2.5);
    _menuMusicGain.connect(ctx.destination);

    function scheduleLoop() {
        if (!_menuMusicPlaying) return;
        const theme = _MENU_THEMES[_menuMusicAtmosphere] || _MENU_THEMES.noche;
        const BEAT = theme.beat;
        const now = ctx.currentTime;

        // --- Melodía principal (caja de música) ---
        let t = now + 0.05;
        theme.melody.forEach(([note, beats]) => {
            const freq = _MENU_NOTE_FREQS[note];
            const dur  = beats * BEAT;
            _playMusicBoxNote(ctx, _menuMusicGain, freq, t, dur, {
                vol: theme.melodyVol, filterFreq: theme.melodyFilter
            });
            t += dur;
        });

        // --- Bajo suave ---
        let bt = now + 0.05;
        theme.bass.forEach(([note, beats]) => {
            const freq = _MENU_NOTE_FREQS[note];
            const dur  = beats * BEAT;
            _playMenuBassNote(ctx, _menuMusicGain, freq, bt, dur * 0.85, {
                vol: theme.bassVol, filterFreq: theme.bassFilter
            });
            bt += dur;
        });

        // Total duración del loop (basada en la melodía)
        const totalBeats = theme.melody.reduce((sum, [,b]) => sum + b, 0);
        const loopDuration = totalBeats * BEAT;

        // Reprogramar el siguiente loop con una pequeña pausa entre repeticiones.
        // Relee la atmósfera activa por si cambió mientras sonaba este loop.
        _menuMusicScheduleId = setTimeout(() => {
            _menuMusicAtmosphere = _getActiveAtmosphere();
            scheduleLoop();
        }, (loopDuration - 0.5) * 1000);
    }

    scheduleLoop();
}

// Cambio de atmósfera con la música ya sonando: crossfade rápido hacia el
// tema nuevo en vez de esperar a que termine el loop actual.
function _crossfadeMenuMusicTo(atmosphere) {
    if (!_menuMusicPlaying || atmosphere === _menuMusicAtmosphere) return;
    const ctx = getAudioContext();
    if (!ctx || !_menuMusicGain) return;

    _menuMusicPlaying = false; // corta el reschedule del loop en curso
    clearTimeout(_menuMusicScheduleId);

    const oldGain = _menuMusicGain;
    const oldNodes = _menuMusicNodes;
    oldGain.gain.cancelScheduledValues(ctx.currentTime);
    oldGain.gain.setValueAtTime(oldGain.gain.value, ctx.currentTime);
    oldGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);

    setTimeout(() => {
        oldNodes.forEach(n => { try { n.disconnect(); } catch (error) { window.EtheriaLogger?.warn('ui:sounds', 'disconnect failed:', error?.message || error); } });
    }, 750);

    startMenuMusic(atmosphere);
}

function stopMenuMusic(fadeOut) {
    if (!_menuMusicPlaying) return;
    _menuMusicPlaying = false;
    clearTimeout(_menuMusicScheduleId);

    const ctx = getAudioContext();
    const fadeDur = (fadeOut !== false) ? 1.2 : 0.15;

    if (_menuMusicGain && ctx) {
        _menuMusicGain.gain.cancelScheduledValues(ctx.currentTime);
        _menuMusicGain.gain.setValueAtTime(_menuMusicGain.gain.value, ctx.currentTime);
        _menuMusicGain.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeDur);
    }

    setTimeout(() => {
        _menuMusicNodes.forEach(n => { try { n.disconnect(); } catch (error) { window.EtheriaLogger?.warn('ui:sounds', 'disconnect failed:', error?.message || error); } });
        _menuMusicNodes = [];
        _menuMusicGain = null;
    }, (fadeDur + 0.1) * 1000);
}


// ============================================
// GESTIÓN DE CICLO DE VIDA — PWA / fondo
// ============================================
// Cuando la PWA pasa a segundo plano (swipe para cerrar, botón home,
// pantalla bloqueada) el audio sigue sonando en Web Audio API
// a menos que lo paremos explícitamente.

(function _registerAudioLifecycle() {

    // ── Page Visibility API ──────────────────────────────────────
    // Se dispara cuando el usuario cambia de pestaña/app o cierra.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // App en fondo: pausar todo el audio
            _suspendAllAudio();
        } else {
            // App de vuelta al frente: reanudar si hacía falta
            _resumeAllAudio();
        }
    });

    // ── pagehide — iOS Safari / PWA swipe-close ──────────────────
    // Complementa visibilitychange en iOS donde puede no dispararse.
    window.addEventListener('pagehide', () => {
        _suspendAllAudio(true); // parada rápida, sin fade
    });

    // ── freeze (Page Lifecycle API) — Android Chrome background ──
    // Cuando Chrome "congela" la pestaña para ahorrar batería.
    window.addEventListener('freeze', () => {
        _suspendAllAudio(true);
    });

    // ── resume — volver de congelado ──────────────────────────────
    window.addEventListener('resume', () => {
        if (!document.hidden) _resumeAllAudio();
    });

    function _suspendAllAudio(fast) {
        // Parar música del menú
        if (_menuMusicPlaying) {
            stopMenuMusic(fast ? false : true); // false = fade rápido
        }
        // Parar lluvia
        if (rainSourceNode) {
            stopRainSound();
        }
        // Suspender el AudioContext completo — libera recursos del SO
        if (audioCtx && audioCtx.state === 'running') {
            audioCtx.suspend().catch(() => {});
        }
    }

    function _resumeAllAudio() {
        // Solo reanudar el contexto — la música no se reinicia sola
        // para no sorprender al usuario. Si quiere música tiene que
        // volver a la pantalla del menú.
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
    }

})();

// ============================================
// CONEXIÓN AL EVENTBUS
// Registra los listeners para que los eventos
// emitidos desde el resto de la app funcionen.
// Se ejecuta en DOMContentLoaded para asegurar
// que eventBus ya está inicializado.
// ============================================

(function _registerAudioEventListeners() {
    function _register() {
        if (typeof eventBus === 'undefined') {
            // eventBus aún no está listo — reintentar en el siguiente tick
            setTimeout(_register, 50);
            return;
        }

        // Música del menú
        eventBus.on('audio:start-menu-music', function () {
            startMenuMusic();
        });
        eventBus.on('audio:stop-menu-music', function (data) {
            stopMenuMusic(data?.fadeOut !== false);
        });
        // Cambiar de atmósfera con la música del menú sonando → crossfade al tema nuevo
        eventBus.on('settings:atmosphere-changed', function (value) {
            _crossfadeMenuMusicTo(value);
        });

        // Lluvia ambiental
        eventBus.on('audio:start-rain', function () {
            startRainSound();
        });
        eventBus.on('audio:stop-rain', function () {
            stopRainSound();
        });

        // Efectos de UI
        eventBus.on('audio:play-sfx', function (data) {
            const sfx = data?.sfx;
            if (sfx === 'save')               playSoundSave();
            else if (sfx === 'click')         playSoundClick();
            else if (sfx === 'tap')           playSoundTap();
            else if (sfx === 'notification')  playSoundNotification();
            else if (sfx === 'affinity-up')   playSoundAffinityUp();
            else if (sfx === 'affinity-down') playSoundAffinityDown();
        });

        // Feedback sutil para botones (evita largos periodos de silencio en la UI)
        let _lastTapAt = 0;
        document.addEventListener('click', function (ev) {
            const target = ev.target instanceof Element
                ? ev.target.closest('button, .vn-control-btn, .vn-dialogue-action-btn, .menu-button, .dm-btn, .vn-option-btn, .reply-emote-btn')
                : null;
            if (!target) return;
            const now = Date.now();
            if (now - _lastTapAt < 70) return; // throttle anti-doble-disparo
            _lastTapAt = now;
            eventBus.emit('audio:play-sfx', { sfx: 'tap' });
        }, true);

        // Aplicar volumen guardado al iniciar
        const savedMaster = parseFloat(localStorage.getItem('etheria_master_volume') || '50') / 100;
        masterVolume = savedMaster * 0.36; // 0.36 = escala interna máxima
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _register);
    } else {
        _register();
    }
})();
