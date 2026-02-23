const Affinity = {
    getKey(charId1, charId2) {
        const ids = [charId1, charId2].sort();
        return `${ids[0]}_${ids[1]}`;
    },

    getRankInfo(value) {
        for (let rank of Data.affinityRanks) {
            if (value >= rank.min && value <= rank.max) {
                return rank;
            }
        }
        return Data.affinityRanks[0];
    },

    getIncrement(currentValue, direction) {
        const rankInfo = this.getRankInfo(currentValue);
        const increment = direction > 0 ? rankInfo.increment : -rankInfo.increment;
        
        let newValue = currentValue + increment;
        
        if (direction > 0 && newValue > rankInfo.max && rankInfo.max < 100) {
            const nextRank = Data.affinityRanks.find(r => r.min > rankInfo.max);
            if (nextRank) newValue = nextRank.min;
            else newValue = rankInfo.max;
        }
        
        if (direction < 0 && newValue < rankInfo.min && rankInfo.min > 0) {
            const prevRank = [...Data.affinityRanks].reverse().find(r => r.max < rankInfo.min);
            if (prevRank) newValue = prevRank.max;
            else newValue = 0;
        }
        
        return Math.max(0, Math.min(100, newValue));
    },

    getValue(topicId, charId1, charId2) {
        const key = this.getKey(charId1, charId2);
        const topicAffinities = Data.state.appData.affinities[topicId] || {};
        return topicAffinities[key] || 0;
    },

    setValue(topicId, charId1, charId2, value) {
        const key = this.getKey(charId1, charId2);
        if (!Data.state.appData.affinities[topicId]) {
            Data.state.appData.affinities[topicId] = {};
        }
        Data.state.appData.affinities[topicId][key] = value;
    },

    modify(direction) {
        const topicId = Data.state.currentTopicId;
        if (!topicId) return;

        const msgs = Data.getMessages(topicId);
        const currentMsg = msgs[Data.state.currentMessageIndex];
        if (!currentMsg || !currentMsg.characterId) return;

        const targetCharId = currentMsg.characterId;
        const targetChar = Data.getCharacter(targetCharId);
        
        if (targetChar && targetChar.userIndex === Data.state.currentUserIndex) {
            UI.showAutosave('No puedes modificar afinidad con tu propio personaje', 'error');
            return;
        }

        const userChars = Data.getUserCharacters();
        const activeCharId = Data.state.selectedCharId || userChars[0]?.id;
        
        if (!activeCharId || activeCharId === targetCharId) return;

        const currentValue = this.getValue(topicId, activeCharId, targetCharId);
        const newValue = this.getIncrement(currentValue, direction);

        if (newValue === currentValue) {
            const msg = direction > 0 && currentValue >= 100 ? 'Afinidad máxima alcanzada' 
                      : direction < 0 && currentValue <= 0 ? 'Afinidad mínima alcanzada' 
                      : null;
            if (msg) UI.showAutosave(msg, 'saved');
            return;
        }

        this.setValue(topicId, activeCharId, targetCharId, newValue);
        Data.state.hasUnsavedChanges = true;
        Storage.save();
        
        const rankInfo = this.getRankInfo(newValue);
        UI.showAutosave(`Afinidad: ${rankInfo.name}`, 'saved');
        
        return newValue;
    },

    shouldShow() {
        if (VN.isFanficMode()) return false;
        
        const topicId = Data.state.currentTopicId;
        if (!topicId) return false;
        
        const msgs = Data.getMessages(topicId);
        if (msgs.length === 0) return false;
        
        const currentMsg = msgs[Data.state.currentMessageIndex];
        if (!currentMsg || currentMsg.isNarrator || !currentMsg.characterId) return false;
        
        const targetChar = Data.getCharacter(currentMsg.characterId);
        if (!targetChar) return false;
        if (targetChar.userIndex === Data.state.currentUserIndex) return false;
        
        return true;
    },

    getCurrentValue() {
        if (!this.shouldShow()) return -1;
        
        const topicId = Data.state.currentTopicId;
        const msgs = Data.getMessages(topicId);
        const currentMsg = msgs[Data.state.currentMessageIndex];
        const targetCharId = currentMsg.characterId;
        
        const userChars = Data.getUserCharacters();
        const activeCharId = Data.state.selectedCharId || userChars[0]?.id;
        
        if (!activeCharId || activeCharId === targetCharId) return -1;
        
        return this.getValue(topicId, activeCharId, targetCharId);
    }
};
