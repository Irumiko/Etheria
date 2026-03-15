# Auditoría técnica integral — Etheria

Fecha: 2026-03-15

## Resumen ejecutivo

Hallazgos principales:

1. **Seguridad (Alta):** existen superficies de XSS por uso de `innerHTML` con contenido dinámico no escapado en algunos flujos de UI (ej. Ethy).  
2. **Configuración/seguridad (Media):** claves/configuración Supabase públicas hardcodeadas en cliente (válido para publishable key, pero dificulta rotación y entornos).  
3. **Rendimiento/arquitectura (Alta):** tamaños muy grandes en archivos núcleo (`css/components.css`, `js/ui/vn.js`) y acoplamiento elevado.  
4. **Manejo de errores (Media):** múltiples `catch {}` silenciosos y degradación “silenciosa” que complica observabilidad.  
5. **Testing/dependencias (Media):** `validate:pwa-e2e` se “omite” con exit 0 sin Playwright, lo cual puede generar falso verde en CI.

## 1) Errores funcionales (bugs)

- Potencial inconsistencia build/runtime: `index.html` referencia `css/non-critical.css`, pero build transforma eso a `dist/noncritical.css` mediante regex. Cambios menores en markup podrían romper ese reemplazo silenciosamente.  
  - Recomendación: manejar esta sustitución por parser/template explícito o generar HTML de dist desde plantilla canónica.

## 2) Errores de lógica

- **Riesgo de “falso éxito” en E2E PWA**: el script termina con `process.exit(0)` si no hay Playwright, por lo que CI puede reportar verde sin prueba real.  
  - Recomendación: exponer modo `--strict` para fallar en CI.

## 3) Errores de seguridad

- **XSS potencial**: en Ethy se inyecta `_currentSayText` directo con `innerHTML`. Si algún texto proviene de entrada no confiable, hay riesgo de script injection.  
  - Recomendación: usar `textContent` por defecto y solo permitir HTML con sanitización explícita.
- **Credenciales/config hardcodeada**: URL y publishable key en frontend repetidas en varios módulos. Aunque la publishable key no es secreta, dificulta rotación, separación de entornos y auditoría de exposición.  
  - Recomendación: centralizar config por `window.__ENV__`/build-time injection, evitar duplicación.

## 4) Errores de rendimiento

- **Monolitos grandes**: `css/components.css` (~11k líneas) y `js/ui/vn.js` (~3.6k líneas) elevan costo de parse/render y mantenibilidad.  
- **`innerHTML` masivo** en varios renderizadores puede provocar reflow/repaint costosos en listas grandes.  
  - Recomendación: virtualización incremental, plantillas con `DocumentFragment`, memoización de secciones estáticas.

## 5) Errores de arquitectura/código

- Acoplamiento alto entre estado global (`window`, `appData`, variables globales) y módulos Supabase/UI.  
- Patrones mixtos (supabase-js y fetch REST directo) aumentan superficie de inconsistencia.  
  - Recomendación: capa única de acceso a datos + contratos por dominio (stories/messages/settings).

## 6) Errores de UX/UI

- Muchos fallos quedan sólo en `console.warn/error`; al usuario no siempre se le muestra feedback accionable.  
- Flujos offline/degradados podrían mostrar estados ambiguos cuando Supabase falla.

## 7) Errores de configuración

- Falta lockfile impide `npm audit` reproducible y control de árbol de dependencias.  
- Configuración de entorno no separada claramente por stage (dev/staging/prod) para Supabase.

## 8) Errores de tipo/TypeScript

- Proyecto JS puro sin tipado estático: riesgo de contratos implícitos rotos en objetos grandes (`msgObj`, snapshots, etc.).  
  - Recomendación: migración gradual a JSDoc + `ts-check` antes de TS completo.

## 9) Manejo de errores

- Uso extendido de `catch {}` vacío en varios módulos (persistencia/UI/audio), que dificulta diagnóstico en producción.  
  - Recomendación: logger central con niveles + tags de contexto.

## 10) Dependencias

- Sin lockfile, sin `npm audit` efectivo en este entorno.  
- Dependencia de CDN de Supabase implica riesgo operativo por disponibilidad externa.

## Priorización sugerida (30-60-90)

### 0-30 días (bloqueadores)
1. Mitigar XSS de `innerHTML` dinámico en Ethy y vistas críticas.
2. Introducir lockfile y pipeline `audit` reproducible.
3. Hacer `validate:pwa-e2e` estricto en CI.

### 30-60 días
1. Centralizar configuración de Supabase por entorno.
2. Reducir catch silenciosos con logger estructurado.
3. Extraer capa de datos única para Supabase.

### 60-90 días
1. Descomposición de `components.css` y `vn.js` por dominios.
2. Introducir tipado incremental (`@ts-check`, JSDoc, luego TS).
3. Optimización de render de listas y hotspots `innerHTML`.
