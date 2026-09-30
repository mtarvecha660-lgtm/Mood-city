// ── js/mobile.js ──
// Handles fullscreen request, orientation, and gyroscope on mobile.

function checkDevice() {
    isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function isLandscape() {
    return window.innerWidth > window.innerHeight;
}

function requestFullscreen() {
    const el  = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req) req.call(el).catch(() => {});
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
    }
}

// Re-enter fullscreen on every tap if not already fullscreen
document.addEventListener('touchstart', () => {
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!isTouchDevice) return;
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement ||
                    document.mozFullScreenElement || document.msFullscreenElement);
    if (!isFs) requestFullscreen();
}, { passive: true });

// ── Gyroscope ──
let gyroPrev = null;

function startGyro() {
    function handleOrientation(e) {
        if (!settings.gyroEnabled || !gameRunning || gamePaused) { gyroPrev = null; return; }
        if (gyroPrev === null) { gyroPrev = { beta: e.beta, gamma: e.gamma }; return; }
        const sens   = settings.gyroSensitivity * 0.004;
        // In landscape: turning phone left/right = beta change (yaw)
        //               tilting phone up/down   = gamma change (pitch)
        let dbeta  = e.beta  - gyroPrev.beta;
        let dgamma = e.gamma - gyroPrev.gamma;
        // Clamp large jumps so orientation wrap-around doesn't glitch the camera
        dbeta  = Math.max(-8, Math.min(8, dbeta));
        dgamma = Math.max(-8, Math.min(8, dgamma));
        yaw   -= dbeta  * sens;
        pitch += dgamma * sens;
        pitch  = Math.max(-1.4, Math.min(1.4, pitch));
        gyroPrev = { beta: e.beta, gamma: e.gamma };
    }
    window.addEventListener('deviceorientation', handleOrientation, true);
}

function enableGyro() {
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+: needs explicit permission
        DeviceOrientationEvent.requestPermission()
            .then(state => {
                if (state === 'granted') {
                    settings.gyroEnabled = true;
                    saveSettings();
                    startGyro();
                    updateSettingsUI();
                }
            }).catch(() => {});
    } else {
        settings.gyroEnabled = true;
        saveSettings();
        startGyro();
        updateSettingsUI();
    }
}

function disableGyro() {
    settings.gyroEnabled = false;
    gyroPrev = null;
    saveSettings();
    updateSettingsUI();
}

function updateOrientationOverlay() {
    if (!isMobile) return; // Desktop: never show overlay
    const overlay = document.getElementById('rotate-overlay');
    if (!isLandscape()) {
        overlay.style.display = 'flex';
        if (gameRunning) { gameRunning = false; } // Pause while portrait
    } else {
        overlay.style.display = 'none';
        // Resume game when rotated back to landscape
        if (hp > 0 && scene && !gameRunning && document.getElementById('ui').style.display === 'block') {
            gameRunning = true;
            if (typeof animate === 'function') animate();
        }
    }
}

window.addEventListener('resize',            updateOrientationOverlay);
window.addEventListener('orientationchange', () => setTimeout(updateOrientationOverlay, 300));
