const Weather = {
    createRain() {
        const container = document.createElement('div');
        container.className = 'weather-rain';
        container.id = 'rainEffect';
        
        for (let i = 0; i < 60; i++) {
            const drop = document.createElement('div');
            drop.className = 'rain-drop';
            drop.style.left = Math.random() * 100 + '%';
            drop.style.height = (10 + Math.random() * 20) + 'px';
            drop.style.animationDuration = (0.5 + Math.random() * 0.5) + 's';
            drop.style.animationDelay = Math.random() * 2 + 's';
            drop.style.opacity = 0.3 + Math.random() * 0.4;
            container.appendChild(drop);
        }
        
        return container;
    },

    createFog() {
        const container = document.createElement('div');
        container.className = 'weather-fog';
        container.id = 'fogEffect';
        
        for (let i = 0; i < 3; i++) {
            const layer = document.createElement('div');
            layer.className = 'fog-layer';
            layer.style.animationDuration = (25 + i * 10) + 's';
            layer.style.animationDirection = i % 2 === 0 ? 'normal' : 'reverse';
            layer.style.opacity = 0.4 - (i * 0.1);
            layer.style.top = (i * 30) + '%';
            container.appendChild(layer);
        }
        
        return container;
    },

    set(weather) {
        Data.state.currentWeather = weather;
        
        const container = document.getElementById('weatherContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (weather === 'rain') {
            container.appendChild(this.createRain());
        } else if (weather === 'fog') {
            container.appendChild(this.createFog());
        }
        
        // Update UI buttons
        document.querySelectorAll('.weather-btn').forEach(btn => {
            btn.classList.remove('active');
            const btnWeather = btn.dataset.weather;
            if (btnWeather === weather) btn.classList.add('active');
        });
    },

    updateUI(containerId, weather) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.querySelectorAll('.weather-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.weather === weather) btn.classList.add('active');
        });
    }
};
