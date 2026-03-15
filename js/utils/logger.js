// Central logger with levels and context tags.
(function initEtheriaLogger(global) {
    const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem('etheria_log_level')) || 'warn';
    let currentLevel = LEVELS[stored] ?? LEVELS.warn;

    function shouldLog(level) {
        const n = LEVELS[level] ?? LEVELS.info;
        return n <= currentLevel;
    }

    function fmt(level, tag, args) {
        const ts = new Date().toISOString();
        return [`[${ts}] [${level.toUpperCase()}]${tag ? ` [${tag}]` : ''}`, ...args];
    }

    const logger = {
        setLevel(level) {
            if (!(level in LEVELS)) return;
            currentLevel = LEVELS[level];
            try { localStorage.setItem('etheria_log_level', level); } catch (error) { console.warn('[EtheriaLogger] localStorage set failed:', error?.message || error); }
        },
        getLevel() {
            return Object.keys(LEVELS).find((k) => LEVELS[k] === currentLevel) || 'warn';
        },
        error(tag, ...args) { if (shouldLog('error')) console.error(...fmt('error', tag, args)); },
        warn(tag, ...args) { if (shouldLog('warn')) console.warn(...fmt('warn', tag, args)); },
        info(tag, ...args) { if (shouldLog('info')) console.info(...fmt('info', tag, args)); },
        debug(tag, ...args) { if (shouldLog('debug')) console.debug(...fmt('debug', tag, args)); },
    };

    global.EtheriaLogger = logger;
})(window);
