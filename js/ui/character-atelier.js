// character-atelier.js — Reorganización del Atelier (modal de personaje)
// Mueve (NO duplica) los campos "sobre el retrato" al panel lateral
// izquierdo, junto al avatar: género, color, y las subidas de avatar/sprite.
// Todos conservan su id, atributos y listeners intactos — updatePreview(),
// selectGender(), saveCharacter() siguen leyendo los mismos elementos.
// Patrón idéntico al layoutPass() de vn-compose.js: idempotente, aditivo.
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

        // Color: solo su propio form-group, no toda la fila (el otro miembro
        // de la fila, Avatar URL, se queda a la derecha)
        const colorInput = identityTab.querySelector('#charColor');
        const colorGroup = colorInput?.closest('.form-group');
        if (colorGroup) extras.appendChild(colorGroup);

        // Botones de subida (avatar + sprite): extraídos de sus filas:
        // el input de texto URL se queda en el formulario, el botón de
        // subida se archiva aquí como acceso directo sobre el retrato
        const avatarUploadLabel = identityTab.querySelector('.avatar-upload-btn');
        const spriteUploadLabel = identityTab.querySelectorAll('.avatar-upload-btn')[1];
        const uploadsRow = document.createElement('div');
        uploadsRow.className = 'atelier-upload-row';
        if (avatarUploadLabel) uploadsRow.appendChild(avatarUploadLabel);
        if (spriteUploadLabel) uploadsRow.appendChild(spriteUploadLabel);
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
