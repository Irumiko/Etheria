// character-atelier.js — Reorganización del Atelier (modal de personaje)
// Mueve (NO duplica) los campos "sobre el retrato" al panel lateral
// izquierdo, junto al avatar: género, alineamiento, orientación, color,
// y las subidas de avatar/sprite (el input de URL manual se oculta del
// todo — solo queda el botón de subir archivo). Todos conservan su id,
// atributos y listeners intactos — updatePreview(), selectGender(),
// saveCharacter() siguen leyendo los mismos elementos por id, estén donde
// estén en el DOM. Patrón idéntico al layoutPass() de vn-compose.js:
// idempotente, aditivo.
(function () {
    'use strict';

    function layoutAtelier() {
        const preview = document.querySelector('#characterModal .editor-preview');
        if (!preview || preview.querySelector('.atelier-side-extras')) return; // ya hecho

        const identityTab = document.getElementById('editor-tab-identity');
        if (!identityTab) return;

        const extras = document.createElement('div');
        extras.className = 'atelier-side-extras';

        // Género: todo el form-group (label + selector + input hidden)
        const genderGroup = identityTab.querySelector('#charGender')?.closest('.form-group');
        if (genderGroup) extras.appendChild(genderGroup);

        // Alineamiento + Orientación: fila compacta de 2 columnas, para
        // que quepan datos "menos genéricos" (más volumen) en el lado
        // derecho sin que el costado se quede corto de sitio.
        const alignGroup = identityTab.querySelector('#charAlignment')?.closest('.form-group');
        const orientationGroup = identityTab.querySelector('#charOrientation')?.closest('.form-group');
        if (alignGroup || orientationGroup) {
            const miniRow = document.createElement('div');
            miniRow.className = 'atelier-mini-row';
            if (alignGroup) miniRow.appendChild(alignGroup);
            if (orientationGroup) miniRow.appendChild(orientationGroup);
            extras.appendChild(miniRow);
        }

        // Color: su propio form-group
        const colorInput = identityTab.querySelector('#charColor');
        const colorGroup = colorInput?.closest('.form-group');
        if (colorGroup) extras.appendChild(colorGroup);

        // Subidas de avatar/sprite: el botón se archiva aquí. El contenedor
        // que dejan atrás (con el input de texto de URL manual) se oculta
        // del todo — ya no tiene sentido un campo de URL si solo se sube
        // archivo desde el costado. El <input> sigue vivo y con su id,
        // solo invisible: saveCharacter()/uploadAvatarForChar() lo siguen
        // leyendo y escribiendo con normalidad.
        const avatarUploadLabel = identityTab.querySelector('.avatar-upload-btn');
        const spriteUploadLabel = identityTab.querySelectorAll('.avatar-upload-btn')[1];
        const uploadsRow = document.createElement('div');
        uploadsRow.className = 'atelier-upload-row';
        if (avatarUploadLabel) {
            const avatarRow = avatarUploadLabel.closest('.form-row') || avatarUploadLabel.closest('.form-group');
            uploadsRow.appendChild(avatarUploadLabel);
            if (avatarRow) avatarRow.style.display = 'none';
        }
        if (spriteUploadLabel) {
            const spriteGroup = spriteUploadLabel.closest('.form-group');
            uploadsRow.appendChild(spriteUploadLabel);
            if (spriteGroup) spriteGroup.style.display = 'none';
        }
        if (uploadsRow.children.length) extras.appendChild(uploadsRow);

        preview.appendChild(extras);
    }

    // Enganchar tras cada apertura del editor (idempotente: si ya se movió,
    // layoutAtelier() no hace nada en la siguiente llamada)
    function hookOpen() {
        if (typeof window.openCharacterEditor !== 'function') return false;
        const orig = window.openCharacterEditor;
        window.openCharacterEditor = function (...args) {
            const r = orig.apply(this, args);
            layoutAtelier();
            return r;
        };
        return true;
    }

    if (!hookOpen()) {
        let tries = 0;
        const iv = setInterval(() => {
            if (hookOpen() || ++tries > 40) clearInterval(iv);
        }, 100);
    }
})();
