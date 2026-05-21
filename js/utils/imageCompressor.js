// ============================================================
// Etheria — Image Compressor
// Comprime imágenes en cliente antes de subirlas a Storage.
// Usa Canvas para redimensionar y convertir a WebP/JPEG.
// API: window.EtheriaImageCompressor.compress(file, opts?)
// ============================================================
(function (global) {
    'use strict';

    // Archivos por debajo de este umbral no merecen la CPU de comprimir
    var SKIP_BELOW_BYTES = 200 * 1024; // 200 KB

    /**
     * Comprime una imagen usando Canvas.
     *
     * Casos donde devuelve el archivo original sin tocar:
     *  - GIF (se perdería la animación)
     *  - Archivos < 200 KB (no merece la pena)
     *  - Canvas no disponible en el entorno
     *  - El resultado comprimido pesa más que el original
     *  - Cualquier error inesperado (fallback silencioso)
     *
     * @param {File}   file
     * @param {object} [opts]
     * @param {number} [opts.maxWidth=1200]
     * @param {number} [opts.maxHeight=1200]
     * @param {number} [opts.quality=0.85]   — calidad WebP/JPEG (0–1)
     * @returns {Promise<File>}
     */
    function compress(file, opts) {
        opts = Object.assign({ maxWidth: 1200, maxHeight: 1200, quality: 0.85 }, opts);

        // GIF: preservar sin cambios (animación)
        if (file.type === 'image/gif') return Promise.resolve(file);
        // Archivos pequeños: no compensa el coste de CPU
        if (file.size < SKIP_BELOW_BYTES) return Promise.resolve(file);
        // Canvas no disponible (SSR, tests, etc.)
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
            return Promise.resolve(file);
        }

        return new Promise(function (resolve) {
            var url = URL.createObjectURL(file);
            var img = new Image();

            img.onload = function () {
                URL.revokeObjectURL(url);

                var w = img.naturalWidth;
                var h = img.naturalHeight;

                // Escalar si supera los límites
                if (w > opts.maxWidth || h > opts.maxHeight) {
                    var ratio = Math.min(opts.maxWidth / w, opts.maxHeight / h);
                    w = Math.round(w * ratio);
                    h = Math.round(h * ratio);
                }

                var canvas = document.createElement('canvas');
                canvas.width  = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);

                canvas.toBlob(function (blob) {
                    // Si el resultado es nulo o más pesado, usar el original
                    if (!blob || blob.size >= file.size) {
                        resolve(file);
                        return;
                    }
                    var ext  = blob.type === 'image/webp' ? 'webp' : 'jpg';
                    var name = file.name.replace(/\.[^.]+$/, '.' + ext);
                    resolve(new File([blob], name, { type: blob.type }));
                }, 'image/webp', opts.quality);
            };

            img.onerror = function () {
                URL.revokeObjectURL(url);
                resolve(file); // fallback silencioso
            };

            img.src = url;
        });
    }

    global.EtheriaImageCompressor = { compress: compress };

}(window));
