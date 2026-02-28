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

    // Filtro paso-banda para imitar el sonido de la lluvia
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.6;

    // Filtro de graves sutil para el retumbar lejano
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowshelf';
    lowFilter.frequency.value = 200;
    lowFilter.gain.value = 3;

    rainGainNode = ctx.createGain();
    rainGainNode.gain.setValueAtTime(0, ctx.currentTime);
    rainGainNode.gain.linearRampToValueAtTime(masterVolume * 0.55, ctx.currentTime + 2.5);

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
