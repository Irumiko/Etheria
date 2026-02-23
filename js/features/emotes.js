const Emotes = {
    showOnSprite(emoteType, spriteElement) {
        if (!emoteType || !spriteElement) return;
        
        const config = Data.emoteConfig[emoteType];
        if (!config) return;
        
        // Remove existing
        const existing = spriteElement.querySelector('.manga-emote');
        if (existing) existing.remove();
        
        const emote = document.createElement('div');
        emote.className = `manga-emote ${config.class}`;
        emote.textContent = config.symbol;
        emote.title = config.name;
        
        spriteElement.appendChild(emote);
        
        setTimeout(() => {
            if (emote.parentElement) {
                emote.style.animation = 'emote-disappear 0.5s ease-out forwards';
                setTimeout(() => emote.remove(), 500);
            }
        }, 3000);
    },

    showOnAvatar(emoteType) {
        if (!emoteType) return;
        
        const config = Data.emoteConfig[emoteType];
        if (!config) return;
        
        const avatarBox = document.getElementById('vnSpeakerAvatar');
        if (!avatarBox) return;
        
        const existing = avatarBox.querySelector('.manga-emote');
        if (existing) existing.remove();
        
        const emote = document.createElement('div');
        emote.className = `manga-emote ${config.class}`;
        emote.textContent = config.symbol;
        emote.title = config.name;
        emote.style.cssText = 'position: absolute; top: -10px; left: -10px; font-size: 2rem;';
        
        avatarBox.style.position = 'relative';
        avatarBox.appendChild(emote);
        
        setTimeout(() => {
            if (emote.parentElement) {
                emote.style.opacity = '0';
                setTimeout(() => emote.remove(), 500);
            }
        }, 3000);
    },

    togglePicker() {
        const picker = document.getElementById('emotePicker');
        if (picker) picker.classList.toggle('active');
    },

    select(emoteType) {
        Data.state.currentEmote = emoteType;
        this.togglePicker();
        
        const replyText = document.getElementById('vnReplyText');
        if (replyText && document.getElementById('vnReplyPanel')?.style.display === 'flex') {
            const cursorPos = replyText.selectionStart;
            const textBefore = replyText.value.substring(0, cursorPos);
            const textAfter = replyText.value.substring(cursorPos);
            replyText.value = textBefore + `/${emoteType} ` + textAfter;
            replyText.focus();
            replyText.setSelectionRange(cursorPos + emoteType.length + 2, cursorPos + emoteType.length + 2);
        }
    },

    parse(text) {
        return TextUtils.parseEmotes(text);
    }
};
