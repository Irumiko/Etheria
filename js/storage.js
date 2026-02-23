'use strict';

    // CARGA AUTOMÁTICA
    // ============================================
    async function selectUser(idx) {
        currentUserIndex = idx;

        const savedCharId = localStorage.getItem(`etheria_selected_char_${currentUserIndex}`);
        selectedCharId = savedCharId || null;

        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.add('active');
        isLoading = true;

        await new Promise(resolve => setTimeout(resolve, 600));

        const userSelectScreen = document.getElementById('userSelectScreen');
        const mainMenu = document.getElementById('mainMenu');
        const currentUserDisplay = document.getElementById('currentUserDisplay');

        if (userSelectScreen) userSelectScreen.classList.add('hidden');
        if (mainMenu) mainMenu.classList.remove('hidden');
        if (currentUserDisplay) currentUserDisplay.textContent = userNames[idx] || 'Jugador';

        if (loadingOverlay) loadingOverlay.classList.remove('active');
        isLoading = false;

        generateParticles();
        showAutosave('Sesión iniciada', 'saved');
    }

    // Generar tarjetas de usuario dinámicamente
    function renderUserCards() {
        const container = document.getElementById('userCardsContainer');
        if (!container) return;

        container.innerHTML = '';

        userNames.forEach((name, idx) => {
            const card = document.createElement('div');
            card.className = 'user-card';
            card.onclick = () => selectUser(idx);
            card.innerHTML = `
                <div class="user-avatar">👤</div>
                <div class="user-name">${escapeHtml(name)}</div>
                <div class="user-hint">Click para entrar</div>
            `;
            container.appendChild(card);
        });

        // Botón para agregar nuevo perfil (máximo 10)
        if (userNames.length < 10) {
            const addCard = document.createElement('div');
            addCard.className = 'add-profile-card';
            addCard.onclick = addNewProfile;
            addCard.innerHTML = `
                <div class="add-profile-icon">+</div>
                <div class="add-profile-text">Crear Perfil</div>
            `;
            container.appendChild(addCard);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function addNewProfile() {
        if (userNames.length >= 10) {
            alert('Máximo de 10 perfiles alcanzado');
            return;
        }
        const newName = prompt('Nombre del nuevo perfil:');
        if (newName && newName.trim()) {
            userNames.push(newName.trim());
            localStorage.setItem('etheria_user_names', JSON.stringify(userNames));
            renderUserCards();
        }
    }

    // Generar partículas según el tema actual
    function generateParticles() {
        const container = document.getElementById('particlesContainer');
        if (!container) return;

        container.innerHTML = '';
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        if (isDark) {
            // Luciérnagas para tema oscuro
            for (let i = 0; i < 20; i++) {
                const firefly = document.createElement('div');
                firefly.className = 'firefly';
                firefly.style.left = Math.random() * 100 + '%';
                firefly.style.top = Math.random() * 100 + '%';
                firefly.style.animationDelay = Math.random() * 4 + 's';
                firefly.style.animationDuration = (3 + Math.random() * 3) + 's';
                firefly.style.setProperty('--move-x', (Math.random() * 100 - 50) + 'px');
                firefly.style.setProperty('--move-y', (Math.random() * 100 - 50) + 'px');
                container.appendChild(firefly);
            }
        } else {
            // Hojas para tema claro
            for (let i = 0; i < 10; i++) {
                const leaf = document.createElement('div');
                leaf.className = 'leaf';
                leaf.style.left = Math.random() * 100 + '%';
                leaf.style.animationDelay = Math.random() * 8 + 's';
                leaf.style.animationDuration = (6 + Math.random() * 4) + 's';
                container.appendChild(leaf);
            }
        }
    }

    // ============================================
