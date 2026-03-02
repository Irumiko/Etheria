// Utilidades de formato y validación para la UI.
// ============================================
// UTILIDADES
// ============================================
function formatText(text) {
    if (!text) return '';
    const escaped = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
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
