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
        try { srcToStop.stop(); } catch (e) {}
    }, 1600);

    rainSourceNode = null;
    rainGainNode = null;
}

// Nota: la integración con setWeather está en effects.js directamente.
// playSoundSave, playSoundClick, playSoundAffinityUp/Down
// se llaman desde app-ui.js, vn.js y roleplay.js respectivamente.

// ============================================
// MELODÍA DEL MENÚ PRINCIPAL — estilo 16-bit
// Generada íntegramente con Web Audio API
// ============================================

let _menuMusicNodes = [];
let _menuMusicPlaying = false;
let _menuMusicScheduleId = null;
let _menuMusicGain = null;

// Escala pentatónica menor en Do — aire oriental/fantástico tranquilo
// Notas: C4 D4 Eb4 G4 A4 C5 D5 Eb5 G5
const _MENU_NOTES = {
    C4: 261.63, D4: 293.66, Eb4: 311.13, F4: 349.23,
    G4: 392.00, Ab4: 415.30, Bb4: 466.16,
    C5: 523.25, D5: 587.33, Eb5: 622.25, F5: 698.46,
    G5: 783.99, Ab5: 830.61,
    C3: 130.81, G3: 196.00, Bb3: 233.08,
    REST: 0
};

// Melodía: [nota, duración_beats]  (tempo ~68bpm, beat = 0.88s)
const _MENU_MELODY = [
    // Frase A — suave ascendente
    ['C4',1],['REST',0.5],['Eb4',0.5],['G4',1],['Ab4',0.5],['G4',0.5],
    ['F4',1],['Eb4',1],['REST',1],
    ['D4',0.5],['Eb4',0.5],['G4',1],['Ab4',1],
    ['Bb4',0.5],['Ab4',0.5],['G4',1],['REST',1],
    // Frase B — sube un poco
    ['C5',1],['Bb4',0.5],['Ab4',0.5],['G4',1],['F4',0.5],['Eb4',0.5],
    ['D4',1.5],['C4',0.5],['REST',1],
    ['Eb4',0.5],['F4',0.5],['G4',1],['Ab4',0.5],['G4',0.5],
    ['F4',1],['Eb4',1.5],['REST',0.5],
    // Frase C — reposo
    ['C4',0.5],['D4',0.5],['Eb4',1],['G4',0.5],['Ab4',0.5],
    ['Bb4',1],['Ab4',0.5],['G4',0.5],['F4',1],
    ['Eb4',0.5],['D4',0.5],['C4',2],['REST',1],
];

// Bajo en arpegios sutiles
const _MENU_BASS = [
    ['C3',2],['G3',2],['Bb3',2],['C3',2],
    ['F4',2],['C3',2],['G3',2],['C3',2],
    ['Bb3',2],['F4',2],['C3',4],
];

function _playMenuNote(ctx, masterGain, freq, startTime, duration, opts) {
    if (!freq || freq === 0) return; // REST
    const o = opts || {};
    const type    = o.type    || 'square';
    const vol     = o.vol     || 0.08;
    const detune  = o.detune  || 0;
    const attack  = o.attack  || 0.01;
    const release = o.release || Math.min(duration * 0.6, 0.25);

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    // Filtro pasabaja para suavizar el square y darle calidez 16-bit
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.filterFreq || 2200;
    filter.Q.value = 0.5;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (detune) osc.detune.setValueAtTime(detune, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + attack);
    gain.gain.setValueAtTime(vol, startTime + duration - release);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    _menuMusicNodes.push(osc);
    _menuMusicNodes.push(gain);
}

function startMenuMusic() {
    if (_menuMusicPlaying) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    _menuMusicPlaying = true;
    _menuMusicNodes = [];

    // Nodo master de la música — fade in suave
    _menuMusicGain = ctx.createGain();
    _menuMusicGain.gain.setValueAtTime(0, ctx.currentTime);
    _menuMusicGain.gain.linearRampToValueAtTime(masterVolume * 0.55, ctx.currentTime + 2.5);
    _menuMusicGain.connect(ctx.destination);

    const BEAT = 0.88; // segundos por beat a ~68bpm

    function scheduleLoop() {
        if (!_menuMusicPlaying) return;
        const now = ctx.currentTime;
        let t = now + 0.05;

        // --- Melodía principal (square suavizado = 16-bit) ---
        _MENU_MELODY.forEach(([note, beats]) => {
            const freq = _MENU_NOTES[note];
            const dur  = beats * BEAT;
            _playMenuNote(ctx, _menuMusicGain, freq, t, dur, {
                type: 'square', vol: 0.065, filterFreq: 1800, attack: 0.012, release: 0.18
            });
            t += dur;
        });

        // --- Armónico suave (triangle una octava arriba) ---
        t = now + 0.05;
        _MENU_MELODY.forEach(([note, beats]) => {
            const freq = _MENU_NOTES[note];
            const dur  = beats * BEAT;
            if (freq && Math.random() > 0.45) {
                _playMenuNote(ctx, _menuMusicGain, freq * 2, t, dur * 0.7, {
                    type: 'triangle', vol: 0.022, filterFreq: 3500, attack: 0.02, release: 0.12
                });
            }
            t += dur;
        });

        // --- Bajo en arpegios (sine) ---
        let bt = now + 0.05;
        _MENU_BASS.forEach(([note, beats]) => {
            const freq = _MENU_NOTES[note];
            const dur  = beats * BEAT;
            _playMenuNote(ctx, _menuMusicGain, freq, bt, dur * 0.55, {
                type: 'sine', vol: 0.045, filterFreq: 600, attack: 0.015, release: 0.2
            });
            bt += dur;
        });

        // Total duración del loop
        const totalBeats = _MENU_MELODY.reduce((sum, [,b]) => sum + b, 0);
        const loopDuration = totalBeats * BEAT;

        // Reprogramar el siguiente loop con una pequeña pausa entre repeticiones
        _menuMusicScheduleId = setTimeout(scheduleLoop, (loopDuration - 0.5) * 1000);
    }

    scheduleLoop();
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
        _menuMusicNodes.forEach(n => { try { n.disconnect(); } catch(e){} });
        _menuMusicNodes = [];
        _menuMusicGain = null;
    }, (fadeDur + 0.1) * 1000);
}
