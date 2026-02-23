const Data = {
    alignments: {
        'LB': 'Legal Bueno', 'LN': 'Legal Neutral', 'LM': 'Legal Malvado',
        'NB': 'Neutral Bueno', 'NN': 'Neutral Neutral', 'NM': 'Neutral Malvado',
        'CB': 'Caótico Bueno', 'CN': 'Caótico Neutral', 'CM': 'Caótico Malvado'
    },

    affinityRanks: [
        { name: 'Desconocidos', min: 0, max: 15, increment: 5, color: '#ffffff' },
        { name: 'Conocidos', min: 16, max: 35, increment: 4, color: '#9b59b6' },
        { name: 'Amigos', min: 36, max: 60, increment: 3, color: '#3498db' },
        { name: 'Mejores Amigos', min: 61, max: 80, increment: 2, color: '#27ae60' },
        { name: 'Interés Romántico', min: 81, max: 95, increment: 1, color: '#f1c40f' },
        { name: 'Pareja', min: 96, max: 100, increment: 0.5, color: '#e74c3c' }
    ],

    emoteConfig: {
        angry: { symbol: '💢', class: 'emote-angry', name: 'Ira' },
        happy: { symbol: '✨', class: 'emote-happy', name: 'Alegría' },
        shock: { symbol: '💦', class: 'emote-shock', name: 'Sorpresa' },
        sad: { symbol: '💧', class: 'emote-sad', name: 'Tristeza' },
        think: { symbol: '💭', class: 'emote-think', name: 'Pensando' },
        love: { symbol: '💕', class: 'emote-love', name: 'Amor' },
        annoyed: { symbol: '💢', class: 'emote-annoyed', name: 'Frustración' },
        embarrassed: { symbol: '〃', class: 'emote-embarrassed', name: 'Vergüenza' },
        idea: { symbol: '💡', class: 'emote-idea', name: 'Idea' },
        sleep: { symbol: '💤', class: 'emote-sleep', name: 'Sueño' }
    },

    state: {
        userNames: ['Jugador 1', 'Jugador 2', 'Jugador 3'],
        currentUserIndex: 0,
        appData: { 
            topics: [], 
            characters: [], 
            messages: {},
            affinities: {}
        },
        currentTopicId: null,
        selectedCharId: null,
        currentSheetCharId: null,
        currentMessageIndex: 0,
        isTyping: false,
        isNarratorMode: false,
        hasUnsavedChanges: false,
        isLoading: false,
        textSpeed: 25,
        currentWeather: 'none',
        currentEmote: null,
        editingMessageId: null,
        tempBranches: []
    },

    getCurrentUserName() {
        return this.state.userNames[this.state.currentUserIndex] || 'Jugador';
    },

    getUserCharacters() {
        return this.state.appData.characters.filter(c => c.userIndex === this.state.currentUserIndex);
    },

    getTopic(id) {
        return this.state.appData.topics.find(t => t.id === id);
    },

    getMessages(topicId) {
        return this.state.appData.messages[topicId] || [];
    },

    getCharacter(id) {
        return this.state.appData.characters.find(c => c.id === id);
    }
};
