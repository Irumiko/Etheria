// Utilidades de formato y validación para la UI.
// ============================================
// UTILIDADES
// ============================================

/**
 * escapeHtml — Fix B: moved here from characters.js so all modules can rely on
 * it regardless of load order. characters.js keeps a compatibility stub.
 * Uses the DOM-based approach (creates a text node) which is the canonical,
 * browser-native way to escape HTML entities.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Asigna HTML sanitizado a un elemento del DOM.
 * Usa DOMPurify si está disponible; si no, cae a textContent como capa de seguridad.
 * Solo permite las etiquetas necesarias para el formato narrativo de Etheria.
 *
 * @param {Element} el - Elemento destino
 * @param {string} html - HTML a insertar (puede contener contenido de usuario)
 */
function safeHtml(el, html) {
    if (!el) return;
    if (typeof DOMPurify !== 'undefined') {
        el.innerHTML = DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['em', 'i', 'strong', 'b', 'u', 's', 'del', 'br',
                           'span', 'div', 'img', 'button', 'optgroup', 'option', 'a'],
            ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'data-fallback',
                           'aria-label', 'aria-pressed', 'role', 'disabled',
                           'onclick', 'value', 'label', 'title', 'href'],
        });
        return;
    }
    // Fallback sin DOMPurify — strip tags no permitidos, conservar los seguros
    const ALLOWED = new Set(['em','i','strong','b','u','s','del','br']);
    const safe = html.replace(/<(\/?)(\w+)[^>]*>/g, (match, slash, tag) =>
        ALLOWED.has(tag.toLowerCase()) ? '<' + slash + tag.toLowerCase() + '>' : ''
    );
    el.innerHTML = safe;
}

function formatText(text) {
    if (!text) return '';
    const s = String(text);

    // Normalizar tags permitidos a minúsculas antes de procesar
    // Esto maneja casos como <EM>, <STRONG>, <B> escritos por el usuario
    const normalised = s.replace(/<(\/?)(EM|I|STRONG|B|U|S|DEL|BR)(\s*\/?)>/gi,
        (_, slash, tag, close) => '<' + slash + tag.toLowerCase() + close + '>');

    // Separar en tokens: tags permitidos vs resto
    const tagRe = /<\/?(?:em|i|strong|b|u|s|del|br)\s*\/?>/gi;
    const parts = normalised.split(tagRe);
    const tags  = normalised.match(tagRe) || [];

    // Escapar solo las partes que no son tags
    const escapePart = (p) => p
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/gs,       '<em>$1</em>');

    // Intercalar partes escapadas con tags originales
    let result = escapePart(parts[0]);
    for (let i = 0; i < tags.length; i++) {
        result += tags[i] + escapePart(parts[i + 1] || '');
    }
    return result;
}

function stripHtml(html) {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function isValidHttpUrl(value) {
    if (!value) return true;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function validateImageUrlField(value, label) {
    if (!value) return true;
    if (!isValidHttpUrl(value)) {
        showAutosave(`${label}: debe ser una URL válida (http o https)`, 'error');
        return false;
    }
    return true;
}

function validateImportedData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('El archivo no contiene un objeto de datos válido');
    }

    if (!Array.isArray(data.topics) || !Array.isArray(data.characters)) {
        throw new Error('Faltan colecciones obligatorias (topics/characters)');
    }

    if (data.messages !== undefined && (typeof data.messages !== 'object' || Array.isArray(data.messages))) {
        throw new Error('messages debe ser un objeto');
    }

    if (data.affinities !== undefined && (typeof data.affinities !== 'object' || Array.isArray(data.affinities))) {
        throw new Error('affinities debe ser un objeto');
    }

    return true;
}

// ============================================
