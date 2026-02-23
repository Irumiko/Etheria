const Options = {
    show(options) {
        const container = document.getElementById('vnOptionsContainer');
        if (!container) return;

        const msgs = Data.getMessages(Data.state.currentTopicId);
        const currentMsg = msgs[Data.state.currentMessageIndex];

        if (!options?.length || VN.isFanficMode()) {
            container.classList.remove('active');
            return;
        }

        container.innerHTML = options.map((opt, idx) => `
            <button class="vn-option-btn ${currentMsg.selectedOptionIndex === idx ? 'chosen' : ''}" 
                    onclick="Options.select(${idx})" 
                    ${currentMsg.selectedOptionIndex !== undefined ? 'disabled' : ''}>
                ${TextUtils.escapeHtml(opt.text)}
            </button>
        `).join('');

        container.classList.add('active');
    },

    select(idx) {
        const topicId = Data.state.currentTopicId;
        const msgs = Data.getMessages(topicId);
        const msg = msgs[Data.state.currentMessageIndex];

        if (!msg.options || msg.selectedOptionIndex !== undefined) return;

        msg.selectedOptionIndex = idx;
        msg.selectedBy = Data.state.currentUserIndex;

        const selectedOption = msg.options[idx];

        if (selectedOption?.continuation) {
            const newMsg = {
                id: Date.now().toString(),
                characterId: null,
                charName: 'Narrador',
                charColor: null,
                charAvatar: null,
                charSprite: null,
                text: selectedOption.continuation,
                isNarrator: true,
                userIndex: Data.state.currentUserIndex,
                timestamp: new Date().toISOString(),
                isOptionResult: true,
                parentOptionIndex: idx
            };

            if (!Data.state.appData.messages[topicId]) {
                Data.state.appData.messages[topicId] = [];
            }
            Data.state.appData.messages[topicId].push(newMsg);
        }

        Data.state.hasUnsavedChanges = true;
        Storage.save();

        document.getElementById('vnOptionsContainer')?.classList.remove('active');
        document.getElementById('messageHasOptions')?.classList.add('hidden');

        Data.state.currentMessageIndex = Data.state.appData.messages[topicId].length - 1;
        VN.showCurrentMessage();
    },

    collectFromForm() {
        const options = [];
        for (let i = 1; i <= 3; i++) {
            const text = document.getElementById(`option${i}Text`)?.value.trim() || '';
            const continuation = document.getElementById(`option${i}Continuation`)?.value.trim() || '';
            if (text && continuation) {
                options.push({ text, continuation });
            }
        }

        if (options.length === 0) {
            alert('Rellena al menos una opción con texto y continuación');
            return null;
        }

        return options;
    },

    // Branch Editor
    openEditor() {
        Data.state.tempBranches = [];
        for (let i = 1; i <= 3; i++) {
            const text = document.getElementById(`option${i}Text`)?.value.trim() || '';
            const cont = document.getElementById(`option${i}Continuation`)?.value.trim() || '';
            if (text || cont) {
                Data.state.tempBranches.push({ id: i, text, continuation: cont });
            }
        }

        this.renderEditor();
        Modals.open('branchEditorModal');
    },

    renderEditor() {
        const container = document.getElementById('branchList');
        if (!container) return;

        if (Data.state.tempBranches.length === 0) {
            container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No hay ramas. Agrega una nueva.</div>';
        } else {
            container.innerHTML = Data.state.tempBranches.map((branch, idx) => `
                <div class="branch-item">
                    <div class="branch-item-header">
                        <span class="branch-item-number">Rama ${idx + 1}</span>
                        <button class="branch-delete-btn" onclick="Options.deleteBranch(${branch.id})">🗑️ Eliminar</button>
                    </div>
                    <input type="text" class="branch-input" placeholder="Texto de la opción" value="${TextUtils.escapeHtml(branch.text)}" onchange="Options.updateBranch(${branch.id}, 'text', this.value)">
                    <textarea class="branch-textarea" placeholder="Continuación narrativa..." onchange="Options.updateBranch(${branch.id}, 'continuation', this.value)">${TextUtils.escapeHtml(branch.continuation)}</textarea>
                </div>
            `).join('');
        }
    },

    addBranch() {
        const newId = Data.state.tempBranches.length > 0 
            ? Math.max(...Data.state.tempBranches.map(b => b.id)) + 1 
            : 1;
        Data.state.tempBranches.push({ id: newId, text: '', continuation: '' });
        this.renderEditor();
    },

    deleteBranch(id) {
        Data.state.tempBranches = Data.state.tempBranches.filter(b => b.id !== id);
        this.renderEditor();
    },

    updateBranch(id, field, value) {
        const branch = Data.state.tempBranches.find(b => b.id === id);
        if (branch) branch[field] = value;
    },

    saveBranches() {
        const validBranches = Data.state.tempBranches.filter(b => b.text.trim() && b.continuation.trim());

        if (validBranches.length === 0 && Data.state.tempBranches.length > 0) {
            alert('Las ramas deben tener tanto texto como continuación');
            return;
        }

        for (let i = 0; i < 3; i++) {
            const textInput = document.getElementById(`option${i+1}Text`);
            const contInput = document.getElementById(`option${i+1}Continuation`);

            if (i < validBranches.length) {
                if (textInput) textInput.value = validBranches[i].text;
                if (contInput) contInput.value = validBranches[i].continuation;
            } else {
                if (textInput) textInput.value = '';
                if (contInput) contInput.value = '';
            }
        }

        Modals.close('branchEditorModal');
    }
};
