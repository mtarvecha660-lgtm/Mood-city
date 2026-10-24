// ── js/mobile.js ──
// Handles fullscreen request, orientation, and gyroscope on mobile.

function checkDevice() {
    isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

function isLandscape() {
    return window.innerWidth > window.innerHeight;
}

// ── Fullscreen, kept on the whole time ──
// Browsers only enter fullscreen from a real user gesture, and `touchstart` is
// NOT one (Chrome needs touchend / pointerup / click), so the old re-enter-on-
// touchstart never fired. webkitRequestFullscreen also returns no Promise, so
// the old `.catch()` threw. Now: try on every pointerup/touchend/click while not
// fullscreen, lock landscape once we are in, and on iPhone (no Fullscreen API
// for pages) show a one-time "Add to Home Screen" hint — the web manifest
// makes the home-screen version run fullscreen in landscape.
const Fullscreen = (() => {
    const isTouch = () => ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement ||
                          document.mozFullScreenElement || document.msFullscreenElement);
    const standalone = () => (window.matchMedia && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches)) || navigator.standalone === true;
    const el = document.documentElement;
    const api = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    const supported = !!api && (document.fullscreenEnabled !== false || document.webkitFullscreenEnabled);
    const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let wanted = false;

    function lockLandscape() {
        try {
            if (screen.orientation && screen.orientation.lock) {
                const p = screen.orientation.lock('landscape');
                if (p && p.catch) p.catch(() => {});
            }
        } catch (e) {}
    }
    let lastTry = 0;
    function enter() {
        if (!isTouch() || isFs() || standalone()) return;
        wanted = true;
        const now = Date.now();
        if (now - lastTry < 700) return;      // one request per tap (pointerup+touchend+click)
        lastTry = now;
        if (!supported) { if (isIOS) showIOSHint(); return; }
        try {
            const p = api.call(el, { navigationUI: 'hide' });
            if (p && p.then) p.then(lockLandscape, () => {}); else setTimeout(lockLandscape, 300);
        } catch (e) {}
    }
    // called by menus / screens after they change; the next tap re-enters if needed
    function ensure() { if (isTouch()) wanted = true; }

    function showIOSHint() {
        try { if (localStorage.getItem('msc_ios_hint')) return; } catch (e) {}
        if (document.getElementById('ios-fs-hint')) return;
        const d = document.createElement('div');
        d.id = 'ios-fs-hint';
        d.innerHTML = '<b>Play full screen on iPhone</b><span>Tap <i class="ios-share">⬆︎</i> Share, then <b>Add to Home Screen</b>, and open Mood Shift City from there.</span><button aria-label="Close">GOT IT</button>';
        d.querySelector('button').addEventListener('click', ev => {
            ev.stopPropagation(); d.remove();
            try { localStorage.setItem('msc_ios_hint', '1'); } catch (e) {}
        });
        document.body.appendChild(d);
    }

    const onGesture = () => { if (wanted && !isFs()) enter(); };
    ['pointerup', 'touchend', 'click'].forEach(t => document.addEventListener(t, onGesture, { passive: true, capture: true }));
    document.addEventListener('fullscreenchange', () => { if (isFs()) lockLandscape(); });
    document.addEventListener('webkitfullscreenchange', () => { if (isFs()) lockLandscape(); });
    if (isTouch()) wanted = true;   // touch devices: fullscreen from the very first tap

    return { enter, ensure, isFs, supported, isIOS, standalone };
})();

function requestFullscreen() { Fullscreen.enter(); }

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
