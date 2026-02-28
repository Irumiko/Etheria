// Navegación entre secciones y galería de personajes.
// NAVEGACIÓN
// ============================================
function confirmUnsavedChanges(callback) {
    if (hasUnsavedChanges) {
        if (confirm('Tienes cambios sin guardar. ¿Deseas guardar antes de salir?')) {
            save();
            callback();
        } else if (confirm('¿Descartar cambios?')) {
            hasUnsavedChanges = false;
            callback();
        }
    } else {
        callback();
    }
}

function resetVNTransientState({ clearTopic = false } = {}) {
    stopTypewriter();
    closeReplyPanel();
    closeContinuation();
    closeSettings();

    const optionsContainer = document.getElementById('vnOptionsContainer');
    if (optionsContainer) optionsContainer.classList.remove('active');

    const emotePicker = document.getElementById('emotePicker');
    if (emotePicker) emotePicker.classList.remove('active');

    const vnSpriteContainer = document.getElementById('vnSpriteContainer');
    if (vnSpriteContainer) vnSpriteContainer.innerHTML = '';

    const weatherContainer = document.getElementById('weatherContainer');
    if (weatherContainer) weatherContainer.innerHTML = '';

    editingMessageId = null;
    pendingContinuation = null;
    currentWeather = 'none';

    if (clearTopic) {
        currentTopicId = null;
        currentMessageIndex = 0;
    }
}

function closeActiveModals() {
    document.querySelectorAll('.modal-overlay.active').forEach((modal) => {
        modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
}

function showSection(section) {
    if (isLoading) return;

    const mainMenu = document.getElementById('mainMenu');
    if (mainMenu) mainMenu.classList.add('hidden');

    resetVNTransientState({ clearTopic: true });
    closeActiveModals();

    document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));

    if(section === 'topics') {
        const topicsSection = document.getElementById('topicsSection');
        if (topicsSection) topicsSection.classList.add('active');
        renderTopics();
    } else if(section === 'gallery') {
        const gallerySection = document.getElementById('gallerySection');
        if (gallerySection) gallerySection.classList.add('active');
        renderGallery();
    } else if(section === 'options') {
        const optionsSection = document.getElementById('optionsSection');
        if (optionsSection) optionsSection.classList.add('active');
    }
}

function backToMenu() {
    confirmUnsavedChanges(() => {
        resetVNTransientState({ clearTopic: true });
        closeActiveModals();
        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) {
            mainMenu.classList.remove('hidden');
            generateParticles();
        }
    });
}

function backToTopics() {
    confirmUnsavedChanges(() => {
        resetVNTransientState({ clearTopic: true });

        const vnSection = document.getElementById('vnSection');
        const topicsSection = document.getElementById('topicsSection');

        if (vnSection) vnSection.classList.remove('active');
        if (topicsSection) topicsSection.classList.add('active');
        renderTopics();
    });
}

// ============================================
// GALERÍA
// ============================================
function setupGallerySearchListeners() {
    const searchInput = document.getElementById('gallerySearch');
    if (!searchInput || searchInput.dataset.debounceBound === '1') return;

    searchInput.dataset.debounceBound = '1';
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            renderGallery();
        }
    });
}

function debounceRenderGallery() {
    window.clearTimeout(gallerySearchDebounceTimer);
    gallerySearchDebounceTimer = window.setTimeout(() => {
        renderGallery();
    }, 300);
}

function initGalleryLazyImages() {
    if (galleryImageObserver) {
        galleryImageObserver.disconnect();
    }

    galleryImageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const image = entry.target;
            const src = image.dataset.src;
            if (src) {
                image.src = src;
                image.removeAttribute('data-src');
            }
            observer.unobserve(image);
        });
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    document.querySelectorAll('#galleryGrid img[data-src]').forEach((img) => {
        galleryImageObserver.observe(img);
    });
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    const searchInput = document.getElementById('gallerySearch');
    const sortSelect = document.getElementById('gallerySort');

    const searchTerm = (searchInput?.value || '').toLowerCase();
    const sortBy = sortSelect?.value || 'default';

    let chars = [...appData.characters];

    if (searchTerm) {
        chars = chars.filter(c =>
            (c.name?.toLowerCase().includes(searchTerm)) ||
            (c.race?.toLowerCase().includes(searchTerm)) ||
            (userNames[c.userIndex]?.toLowerCase().includes(searchTerm))
        );
    }

    if (sortBy === 'owner') {
        chars.sort((a, b) => a.userIndex - b.userIndex || a.name.localeCompare(b.name));
    } else if (sortBy === 'name') {
        chars.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'race') {
        chars.sort((a, b) => (a.race || '').localeCompare(b.race || ''));
    }

    const galleryCount = document.getElementById('galleryCount');
    if (galleryCount) galleryCount.textContent = `${chars.length} personaje${chars.length !== 1 ? 's' : ''}`;

    if (chars.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">No se encontraron personajes</div>';
        return;
    }

    grid.innerHTML = chars.map(c => {
        const genderIcon = c.gender === 'Femenino' ? '♀️' : c.gender === 'Masculino' ? '♂️' : '⚪';
        const ownerName = userNames[c.userIndex] || 'Desconocido';

        return `
            <div class="character-card" onclick="openSheet('${c.id}')">
                <div class="character-card-avatar">
                    ${c.avatar ? `<img data-src="${escapeHtml(c.avatar)}" alt="Avatar de ${escapeHtml(c.name)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\'placeholder\'>${c.name[0]}</div>'">` : `<div class="placeholder">${c.name[0]}</div>`}
                </div>
                <div class="character-card-info">
                    <div class="character-card-name">${escapeHtml(c.name)}</div>
                    <div class="character-card-meta">
                        <span class="gender-icon">${genderIcon}</span>
                        <span>${escapeHtml(c.race) || 'Sin raza'}</span>
                    </div>
                </div>
                <div class="character-card-hover-info">
                    <div>Por: ${escapeHtml(ownerName)}</div>
                    <div>${escapeHtml(c.race) || 'Sin raza'}</div>
                </div>
            </div>
        `;
    }).join('');

    initGalleryLazyImages();
}

// ============================================
