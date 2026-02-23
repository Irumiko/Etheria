const DOM = {
    $(selector) {
        return document.querySelector(selector);
    },

    $$(selector) {
        return document.querySelectorAll(selector);
    },

    create(tag, classes = '', content = '') {
        const el = document.createElement(tag);
        if (classes) el.className = classes;
        if (content) el.innerHTML = content;
        return el;
    },

    show(el) {
        if (typeof el === 'string') el = document.querySelector(el);
        if (el) el.classList.remove('hidden');
    },

    hide(el) {
        if (typeof el === 'string') el = document.querySelector(el);
        if (el) el.classList.add('hidden');
    },

    toggle(el, className = 'active') {
        if (typeof el === 'string') el = document.querySelector(el);
        if (el) el.classList.toggle(className);
    }
};
