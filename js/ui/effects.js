// Efectos visuales: clima y emotes manga.
// ============================================
// EFECTOS CLIMA
// ============================================
function createRainEffect() {
    const container = document.createElement('div');
    container.className = 'weather-rain';
    container.id = 'rainEffect';

    // Crear 60 gotas máximo
    for (let i = 0; i < 60; i++) {
        const drop = document.createElement('div');
        drop.className = 'rain-drop';
        drop.style.left = Math.random() * 100 + '%';
        drop.style.height = (10 + Math.random() * 20) + 'px';
        drop.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
        drop.style.animationDelay = Math.random() * 2 + 's';
        drop.style.opacity = 0.3 + Math.random() * 0.4;
        container.appendChild(drop);
    }

    return container;
}

function createFogEffect() {
    const container = document.createElement('div');
    container.className = 'weather-fog';
    container.id = 'fogEffect';

    // 3 capas de niebla
    for (let i = 0; i < 3; i++) {
        const layer = document.createElement('div');
        layer.className = 'fog-layer';
        container.appendChild(layer);
    }

    return container;
}

function setWeather(weather) {
    currentWeather = weather;

    // Actualizar botones
    document.querySelectorAll('#weatherSelectorContainer .weather-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(weather === 'rain' ? 'lluvia' : weather === 'fog' ? 'niebla' : 'normal')) {
            btn.classList.add('active');
        }
    });

    // Limpiar efectos anteriores
    const weatherContainer = document.getElementById('weatherContainer');
    if (weatherContainer) {
        weatherContainer.innerHTML = '';
    }

    // Aplicar nuevo efecto visual
    if (weather === 'rain') {
        weatherContainer.appendChild(createRainEffect());
    } else if (weather === 'fog') {
        weatherContainer.appendChild(createFogEffect());
    }

    // Sonido ambiental de lluvia (definido en sounds.js)
    if (weather === 'rain') {
        if (typeof startRainSound === 'function') startRainSound();
    } else {
        if (typeof stopRainSound  === 'function') stopRainSound();
    }
}

function setTopicWeather(weather, button = null) {
    document.getElementById('topicWeatherInput').value = weather;

    const buttons = document.querySelectorAll('#topicModal .topic-weather-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    const activeButton = button || document.querySelector(`#topicModal .topic-weather-btn[data-weather="${weather}"]`);
    if (activeButton) activeButton.classList.add('active');
}

// ============================================
// EMOTES MANGA
// ============================================
function toggleEmotePicker() {
    const picker = document.getElementById('emotePicker');
    if (picker) {
        picker.classList.toggle('active');
    }
}

function insertEmoteInReplyText(emoteType) {
    const replyText = document.getElementById('vnReplyText');
    const replyPanel = document.getElementById('vnReplyPanel');
    if (!replyText || replyPanel?.style.display !== 'flex') return;

    const cursorPos = replyText.selectionStart;
    const textBefore = replyText.value.substring(0, cursorPos);
    const textAfter = replyText.value.substring(cursorPos);
    replyText.value = textBefore + `/${emoteType} ` + textAfter;
    replyText.focus();
    replyText.setSelectionRange(cursorPos + emoteType.length + 2, cursorPos + emoteType.length + 2);
}

function selectEmote(emoteType) {
    currentEmote = emoteType;
    toggleEmotePicker();
    insertEmoteInReplyText(emoteType);
}

function toggleReplyEmotePopover(event) {
    event?.stopPropagation();

    const popover = document.getElementById('replyEmotePopover');
    const button = document.getElementById('replyEmoteToggle');
    if (!popover || !button) return;

    const willOpen = !popover.classList.contains('active');
    popover.classList.toggle('active', willOpen);
    popover.setAttribute('aria-hidden', willOpen ? 'false' : 'true');
    button.classList.toggle('active', willOpen);
}

function closeReplyEmotePopover() {
    const popover = document.getElementById('replyEmotePopover');
    const button = document.getElementById('replyEmoteToggle');
    if (!popover || !button) return;

    popover.classList.remove('active');
    popover.setAttribute('aria-hidden', 'true');
    button.classList.remove('active');
}

function selectReplyEmote(emoteType) {
    currentEmote = emoteType;
    insertEmoteInReplyText(emoteType);
    closeReplyEmotePopover();
}

function setupReplyEmotePopover() {
    document.addEventListener('click', (event) => {
        const popover = document.getElementById('replyEmotePopover');
        const button = document.getElementById('replyEmoteToggle');
        if (!popover || !button || !popover.classList.contains('active')) return;

        const target = event.target;
        if (target instanceof Element && (target.closest('#replyEmotePopover') || target.closest('#replyEmoteToggle'))) {
            return;
        }

        closeReplyEmotePopover();
    });
}

function parseEmotes(text) {
    // Buscar comandos de emote /tipo
    const emoteRegex = /\/(angry|happy|shock|sad|think|love|annoyed|embarrassed|idea|sleep)\b/gi;
    const matches = [];
    let match;

    while ((match = emoteRegex.exec(text)) !== null) {
        matches.push(match[1].toLowerCase());
    }

    // Eliminar comandos del texto visible
    const cleanText = text.replace(emoteRegex, '').trim();

    return { emotes: matches, text: cleanText };
}

function showEmoteOnSprite(emoteType, spriteElement) {
    if (!emoteType || !spriteElement) return;

    const config = emoteConfig[emoteType];
    if (!config) return;

    // Limpiar emotes anteriores
    const existingEmote = spriteElement.querySelector('.manga-emote');
    if (existingEmote) {
        existingEmote.remove();
    }

    // Crear nuevo emote
    const emote = document.createElement('div');
    emote.className = `manga-emote ${config.class}`;
    emote.textContent = config.symbol;
    emote.title = config.name;

    spriteElement.appendChild(emote);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        if (emote.parentElement) {
            emote.style.animation = 'emote-disappear 0.5s ease-out forwards';
            setTimeout(() => emote.remove(), 500);
        }
    }, 3000);
}

function showEmoteOnAvatar(emoteType) {
    if (!emoteType) return;

    const config = emoteConfig[emoteType];
    if (!config) return;

    const avatarBox = document.getElementById('vnSpeakerAvatar');
    if (!avatarBox) return;

    // Limpiar emotes anteriores
    const existingEmote = avatarBox.querySelector('.manga-emote');
    if (existingEmote) {
        existingEmote.remove();
    }

    // Crear nuevo emote posicionado en esquina superior izquierda del avatar
    const emote = document.createElement('div');
    emote.className = `manga-emote ${config.class}`;
    emote.textContent = config.symbol;
    emote.title = config.name;
    emote.style.position = 'absolute';
    emote.style.top = '-10px';
    emote.style.left = '-10px';
    emote.style.fontSize = '2rem';

    avatarBox.style.position = 'relative';
    avatarBox.appendChild(emote);

    // Auto-remover después de 3 segundos
    setTimeout(() => {
        if (emote.parentElement) {
            emote.style.opacity = '0';
            setTimeout(() => emote.remove(), 500);
        }
    }, 3000);
}

