
// VisibilityManager — sincroniza --section-animations con la sección activa
// Más preciso que el selector CSS :not(.active) para transiciones con delay
const _sectionAnimControl = {
    pause(sectionEl) {
        if (!sectionEl) return;
        sectionEl.style.setProperty('--section-animations', 'paused');
        sectionEl.querySelectorAll('.vn-sprite img').forEach(img => {
            img.style.animationPlayState = 'paused';
        });
    },
    resume(sectionEl) {
        if (!sectionEl) return;
        sectionEl.style.removeProperty('--section-animations');
        sectionEl.querySelectorAll('.vn-sprite img').forEach(img => {
            img.style.animationPlayState = '';
        });
    },
    sync() {
        document.querySelectorAll('.game-section').forEach(s => {
            if (s.classList.contains('active')) this.resume(s);
            else this.pause(s);
        });
    }
};

// ── Transición suave entre secciones (absorbido de mejoras.js) ───────────────
// _skipNextFadeTransition: characters.js lo activa al volver de selección de perfil
// para evitar el overlay negro innecesario.
var _skipNextFadeTransition = false;
var _fadeTransitionInProgress = false;

function _clearFadeOverlay(overlay, delay) {
    setTimeout(function() {
        if (overlay) {
            overlay.classList.remove('fade-out');
            overlay.style.transition = '';
        }
        _fadeTransitionInProgress = false;
    }, delay);
}

function fadeTransition(callback, duration) {
    duration = duration || 280;
    if (_skipNextFadeTransition) {
        _skipNextFadeTransition = false;
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        return;
    }
    if (_fadeTransitionInProgress) {
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        return;
    }
    var overlay = document.getElementById('sectionTransitionOverlay');
    if (!overlay) {
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        return;
    }
    _fadeTransitionInProgress = true;
    overlay.style.transition = 'opacity ' + duration + 'ms ease';
    overlay.classList.add('fade-out');
    setTimeout(function() {
        try { callback(); } catch(e) { console.error('[fadeTransition]', e); }
        finally { _clearFadeOverlay(overlay, Math.round(duration * 0.6)); }
    }, duration);
}

// Navegación entre secciones y galería de personajes.
// NAVEGACIÓN
// ============================================
function confirmUnsavedChanges(callback) {
    if (!hasUnsavedChanges) {
        callback();
        return;
    }
    // Primero: ¿guardar antes de salir?
    openConfirmModal('Tienes cambios sin guardar. ¿Guardar antes de salir?', 'Guardar').then(wantsSave => {
        if (wantsSave) {
            save({ silent: true });
            callback();
        } else {
            // Segundo: ¿descartar?
            openConfirmModal('¿Descartar los cambios sin guardar?', 'Descartar').then(wantsDiscard => {
                if (wantsDiscard) {
                    hasUnsavedChanges = false;
                    callback();
                }
                // Si cancela en ambos, no hace nada
            });
        }
    });
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

    if (typeof cleanupVnRuntimeResources === 'function') {
        cleanupVnRuntimeResources({ disconnectObserver: true, clearSpritePool: clearTopic, stopSpriteBlink: true });
    }

    const vnSpriteContainer = document.getElementById('vnSpriteContainer');
    if (vnSpriteContainer) vnSpriteContainer.innerHTML = '';

    const weatherContainer = document.getElementById('weatherContainer');
    if (weatherContainer) weatherContainer.innerHTML = '';

    // Detener sonido ambiental de lluvia si estaba activo
    eventBus.emit('audio:stop-rain');

    editingMessageId = null;
    pendingContinuation = null;
    currentWeather = 'none';
    currentFilter = 'none';
    document.body.classList.remove('mode-rpg');
    document.body.classList.remove('mode-classic');
    // Cerrar mini-panel del oráculo si está abierto
    const oracleMini = document.getElementById('vnOracleMiniPanel');
    if (oracleMini) oracleMini.style.display = 'none';

    if (clearTopic) {
        // Cancelar suscripción realtime al salir de una historia
        if (typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.unsubscribe === 'function') {
            SupabaseMessages.unsubscribe();
        }
        if (typeof clearTypingState === 'function') clearTypingState();
        if (typeof cancelContinuousRead === 'function') cancelContinuousRead('exit-topic');
        if (typeof updateRoomCodeUI === 'function') updateRoomCodeUI(null);
        currentTopicId = null;
        currentMessageIndex = 0;
    }
}

// ── Listener EventBus: ui:reset-vn-state ─────────────────────────────────────
// vn.js emite este evento al entrar a un tema para limpiar el estado transitorio.
// navigation.js es el dueño de resetVNTransientState — este listener es el
// único punto de entrada desde módulos externos.
(function _initNavigationListeners() {
    if (window._navigationListenersReady) return;
    window._navigationListenersReady = true;
    if (typeof eventBus !== 'undefined') {
        eventBus.on('ui:reset-vn-state', function() {
            resetVNTransientState();
        });
    }
})();

function closeActiveModals() {
    document.querySelectorAll('.modal-overlay.active').forEach((modal) => {
        modal.classList.remove('active');
    });
    document.body.classList.remove('modal-open');
}

function getCurrentVisibleSection() {
    const mainMenu = document.getElementById('mainMenu');
    if (mainMenu && !mainMenu.classList.contains('hidden')) return 'mainMenu';

    if (document.getElementById('topicsSection')?.classList.contains('active')) return 'topics';
    if (document.getElementById('gallerySection')?.classList.contains('active')) return 'gallery';
    if (document.getElementById('optionsSection')?.classList.contains('active')) return 'options';

    return null;
}

function showSection(section) {
    if (isLoading) return;
    if (_fadeTransitionInProgress) return;

    const currentSection = getCurrentVisibleSection();
    if (currentSection === section) return;

    // transición visual absorbida de mejoras.js (Mejora 9)
    fadeTransition(function() {
        const mainMenu = document.getElementById('mainMenu');
        if (mainMenu) mainMenu.classList.add('hidden');
        eventBus.emit('audio:stop-menu-music');

        resetVNTransientState({ clearTopic: true });
        closeActiveModals();

        document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
        requestAnimationFrame(() => _sectionAnimControl.sync());

        if(section === 'topics') {
            const topicsSection = document.getElementById('topicsSection');
            if (topicsSection) topicsSection.classList.add('active');
            renderTopics();
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'topics' } }));
        } else if(section === 'gallery') {
            const gallerySection = document.getElementById('gallerySection');
            if (gallerySection) gallerySection.classList.add('active');
            renderGallery();
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'gallery' } }));
        } else if(section === 'options') {
            const optionsSection = document.getElementById('optionsSection');
            if (optionsSection) optionsSection.classList.add('active');
            if (typeof syncOptionsSection === 'function') syncOptionsSection();
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'options' } }));
        }
    }, 150);
}

function backToMenu() {
    confirmUnsavedChanges(() => {
        // transición visual absorbida de mejoras.js (Mejora 9)
        fadeTransition(function() {
            resetVNTransientState({ clearTopic: true });
            closeActiveModals();
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            const mainMenu = document.getElementById('mainMenu');
            if (mainMenu) {
                mainMenu.classList.remove('hidden');
                generateParticles();
                eventBus.emit('audio:start-menu-music');
                const particles = document.getElementById('particlesContainer');
                if (particles) particles.style.transform = '';
            }
            window.dispatchEvent(new CustomEvent('etheria:section-changed', { detail: { section: 'mainMenu' } }));
        }, 150);
    });
}

function backToTopics() {
    confirmUnsavedChanges(() => {
        // transición visual absorbida de mejoras.js (Mejora 9)
        fadeTransition(function() {
            if (typeof CollaborativeGuard !== 'undefined') CollaborativeGuard.stop();
            if (typeof SupabaseMessages !== 'undefined' && typeof SupabaseMessages.unsubscribeGlobal === 'function') {
                SupabaseMessages.unsubscribeGlobal();
            }
            if (typeof _globalRealtimeHandlerRef !== 'undefined' && _globalRealtimeHandlerRef) {
                window.removeEventListener('etheria:realtime-message', _globalRealtimeHandlerRef);
                _globalRealtimeHandlerRef = null;
            }
            resetVNTransientState({ clearTopic: true });
            // Limpiar TODAS las secciones activas (no solo vnSection)
            // para evitar que options/gallery queden visibles encima de topics
            document.querySelectorAll('.game-section').forEach(s => s.classList.remove('active'));
            const topicsSection = document.getElementById('topicsSection');
            if (topicsSection) topicsSection.classList.add('active');
            renderTopics();
        }, 150);
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
                // Blur-up: mostrar shimmer, luego transición suave
                image.classList.add('gallery-img-loading');
                const tmp = new Image();
                tmp.onload = () => {
                    image.src = src;
                    image.removeAttribute('data-src');
                    requestAnimationFrame(() => {
                        image.classList.remove('gallery-img-loading');
                        image.classList.add('gallery-img-loaded');
                    });
                };
                tmp.onerror = () => {
                    image.classList.remove('gallery-img-loading');
                    image.removeAttribute('data-src');
                };
                tmp.src = src;
            }
            observer.unobserve(image);
        });
    }, { rootMargin: '200px 0px', threshold: 0.01 });

    document.querySelectorAll('#galleryGrid img[data-src]').forEach((img) => {
        // XSS fix: bind onerror here where we have DOM access (data-fallback set in template)
        if (!img._onerrorBound) {
            img._onerrorBound = true;
            img.onerror = function () {
                this.style.display = 'none';
                const _fb = document.createElement('div');
                _fb.className = 'char-card-initial';
                _fb.textContent = this.dataset.fallback || '?';
                this.parentElement.appendChild(_fb);
            };
        }
        galleryImageObserver.observe(img);
    });
}

function fuzzySearch(query, items) {
    const terms = String(query || "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return items;
    return items.filter((item) => {
        const text = `${item.name || ""} ${item.race || ""} ${item.ownerName || ""}`.toLowerCase();
        return terms.every((term) => text.includes(term));
    });
}

// REEMPLAZO COMPLETO de la lógica de galería
let _gallerySortMode = 'default';
let _galleryActiveRaces = new Set();

function setGallerySort(mode, btn) {
    _gallerySortMode = mode;
    document.querySelectorAll('.gallery-sort-pill').forEach(p => p.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderGallery();
}

function onGallerySearch(val) {
    const suggestions = document.getElementById('gallerySuggestions');
    if (!suggestions) return;
    if (!val.trim()) { suggestions.style.display = 'none'; renderGallery(); return; }
    renderGallery();

    // Sugerencias predictivas
    const lower = val.toLowerCase();
    const allNames = appData.characters.flatMap(c => [c.name, c.race, c.job, userNames[c.userIndex]].filter(Boolean));
    const matches = [...new Set(allNames)].filter(n => n.toLowerCase().includes(lower) && n.toLowerCase() !== lower).slice(0, 5);

    if (matches.length) {
        // XSS/injection fix: use data attribute + safe click handler
        // (inline onclick with escapeHtml can break on apostrophes in JS string context)
        suggestions.innerHTML = '';
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'gallery-suggestion';
            div.textContent = m;
            div.addEventListener('click', function () {
                const searchInput = document.getElementById('gallerySearch');
                if (searchInput) searchInput.value = m;
                suggestions.style.display = 'none';
                renderGallery();
            });
            suggestions.appendChild(div);
        });
        suggestions.style.display = 'block';
    } else {
        suggestions.style.display = 'none';
    }
}

function toggleRaceFilter(race) {
    if (_galleryActiveRaces.has(race)) _galleryActiveRaces.delete(race);
    else _galleryActiveRaces.add(race);
    renderRaceTagPills();
    renderGallery();
}

function renderRaceTagPills() {
    const container = document.getElementById('galleryRaceTags');
    if (!container) return;
    const allRaces = [...new Set(appData.characters.map(c => c.race).filter(Boolean))].sort();
    if (allRaces.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = allRaces.map(r => `
        <button class="race-pill ${_galleryActiveRaces.has(r) ? 'active' : ''}" onclick="toggleRaceFilter('${escapeHtml(r)}')">${escapeHtml(r)}</button>
    `).join('');
}


function updateGalleryControlsState(totalChars) {
    const disableSort = Number(totalChars || 0) <= 1;
    document.querySelectorAll('.gallery-sort-pill').forEach((pill) => {
        pill.disabled = disableSort;
        pill.classList.toggle('is-disabled', disableSort);
        pill.title = disableSort ? 'Disponible al tener más personajes' : '';
    });
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    document.getElementById('gallerySuggestions')?.style && (document.getElementById('gallerySuggestions').style.display = 'none');

    const searchTerm = (document.getElementById('gallerySearch')?.value || '').toLowerCase().trim();

    let chars = [...appData.characters];

    if (searchTerm) chars = fuzzySearch(searchTerm, chars.map(c => ({ ...c, ownerName: userNames[c.userIndex] || '' })));
    if (_galleryActiveRaces.size > 0) chars = chars.filter(c => _galleryActiveRaces.has(c.race));

    if (_gallerySortMode === 'owner')  chars.sort((a, b) => a.userIndex - b.userIndex || a.name.localeCompare(b.name));
    else if (_gallerySortMode === 'name')  chars.sort((a, b) => a.name.localeCompare(b.name));
    else if (_gallerySortMode === 'race')  chars.sort((a, b) => (a.race||'').localeCompare(b.race||''));

    const galleryCount = document.getElementById('galleryCount');
    if (galleryCount) galleryCount.textContent = `${chars.length} personaje${chars.length !== 1 ? 's' : ''}`;

    updateGalleryControlsState(appData.characters.length);
    renderRaceTagPills();

    if (chars.length === 0) {
        const isEmpty = appData.characters.length === 0;
        grid.innerHTML = isEmpty
            ? `<div class="gallery-empty">
                <div class="gallery-empty-icon">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" class="etheria-mascot">
                        <ellipse cx="40" cy="68" rx="22" ry="6" class="mascot-shadow"/>
                        <rect x="14" y="18" width="52" height="42" rx="4" class="mascot-body"/>
                        <path d="M28 34 Q40 20 52 34" class="mascot-arc" stroke-width="1.5" stroke-linecap="round" fill="none"/>
                        <path d="M35 42 Q37 38 40 42 Q43 38 45 42" class="mascot-mouth" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                        <circle cx="33" cy="38" r="1.5" class="mascot-eye"/>
                        <circle cx="47" cy="38" r="1.5" class="mascot-eye"/>
                        <path d="M58 10 C58 10 62 22 55 24" class="mascot-antenna" stroke-width="1.2" stroke-linecap="round" fill="none"/>
                        <path d="M56 10 L60 8 L58 12" class="mascot-antenna-tip"/>
                    </svg>
                </div>
                <p class="gallery-empty-text">Ningún alma ha sido plasmada todavía…</p>
                <p class="gallery-empty-sub">El libro de personajes aguarda su primera historia.</p>
                <button class="gallery-empty-btn" onclick="openCharacterEditor()">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    Crear primer personaje
                </button>
            </div>`
            : `<div class="gallery-empty"><p class="gallery-empty-text" style="font-size:1rem;">Sin resultados para esa búsqueda</p></div>`;
        return;
    }

    grid.innerHTML = chars.map((c, i) => {
        const ownerName = userNames[c.userIndex] || 'Desconocido';
        const isOwn = c.userIndex === currentUserIndex;
        const charColor = c.color || '#8b7355';
        const genderLabel = c.gender === 'Femenino' ? '♀' : c.gender === 'Masculino' ? '♂' : '◇';

        return `
        <div class="char-card-v2" onclick="openSheet('${c.id}')" style="--card-color:${charColor}; animation-delay:${i * 0.03}s">
            <div class="char-card-avatar">
                ${c.avatar
                    ? `<img data-src="${escapeHtml(c.avatar)}" alt="${escapeHtml(c.name)}" loading="lazy" data-fallback="${escapeHtml((c.name || '?')[0])}" class="char-card-img">`
                    : `<div class="char-card-initial">${escapeHtml((c.name || '?')[0])}</div>`}
            </div>
            <div class="char-card-overlay">
                <div class="char-card-top-badge ${isOwn ? 'own' : 'other'}">
                    ${isOwn ? '✦ Tu personaje' : escapeHtml(ownerName)}
                </div>
                <div class="char-card-info">
                    <div class="char-card-name">${escapeHtml(c.name)}</div>
                    <div class="char-card-meta">
                        <span class="char-card-gender">${genderLabel}</span>
                        ${c.race ? `<span class="char-card-race">${escapeHtml(c.race)}</span>` : ''}
                        ${c.age ? `<span class="char-card-age">${c.age} años</span>` : ''}
                    </div>
                </div>
                <div class="char-card-hover-extra">
                    ${c.job ? `<div class="char-card-job">${escapeHtml(c.job)}</div>` : ''}
                    ${c.basic ? `<div class="char-card-desc">${escapeHtml(c.basic.slice(0, 90))}${c.basic.length > 90 ? '…' : ''}</div>` : ''}
                </div>
            </div>
        </div>`;
    }).join('');

    if (appData.characters.length > 0 && appData.characters.length < 6) {
        grid.insertAdjacentHTML('beforeend', `
            <button class="char-card-v2 char-card-v2--new" onclick="openCharacterEditor()" type="button" aria-label="Crear personaje">
                <span class="char-card-new-plus">+</span>
                <span class="char-card-new-text">Crear nuevo personaje</span>
            </button>
        `);
    }

    initGalleryLazyImages();
}


// ============================================
