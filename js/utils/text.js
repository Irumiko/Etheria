const TextUtils = {
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatText(text) {
        if (!text) return '';
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        return text;
    },

    stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    },

    parseEmotes(text) {
        const emoteRegex = /\/(angry|happy|shock|sad|think|love|annoyed|embarrassed|idea|sleep)\b/gi;
        const matches = [];
        let match;
        
        while ((match = emoteRegex.exec(text)) !== null) {
            matches.push(match[1].toLowerCase());
        }
        
        const cleanText = text.replace(emoteRegex, '').trim();
        return { emotes: matches, text: cleanText };
    }
};
