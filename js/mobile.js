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

// ── Gyroscope aim ──
// What was wrong before: it read raw Euler beta/gamma deltas as if beta = turn and
// gamma = tilt. In landscape that's wrong (turning the phone mostly changes alpha),
// it ignored which way the phone is rotated (90° vs 270° flips the signs), gamma
// wraps at ±90° (the camera jumped when the phone passed vertical), and the
// listener was only attached when you flipped the toggle, so after a reload the
// setting said ON but nothing listened. Re-toggling also stacked duplicate listeners.
//
// Now: the device orientation becomes a full quaternion (the standard
// DeviceOrientationControls maths), corrected for screen.orientation.angle, and we
// read the yaw/pitch of the direction the phone's back camera points. Only the
// frame-to-frame CHANGE is added to yaw/pitch, so it stacks with touch-drag look.
// Low-pass smoothing + a small soft deadzone remove hand jitter; enabling (or
// resuming) recenters, i.e. however you hold the phone right now = neutral.
const Gyro = (() => {
    const DEG = Math.PI / 180;
    const zee = new THREE.Vector3(0, 0, 1);
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about X: look out of the back of the device
    const euler = new THREE.Euler();
    const q = new THREE.Quaternion();
    const fwd = new THREE.Vector3();
    let listening = false, ref = null, smooth = null, lastEventAt = 0, gotAny = false;
    const SMOOTH = 0.35;          // 0..1, higher = snappier
    const DEADZONE = 0.0009;      // rad per event (~0.05°): kills jitter, keeps slow aim

    function screenAngle() {
        const so = window.screen && window.screen.orientation;
        if (so && typeof so.angle === 'number') return so.angle;
        if (typeof window.orientation === 'number') return window.orientation; // older iOS
        return 0;
    }
    // device alpha/beta/gamma (deg) + screen angle (deg) -> camera yaw/pitch (rad), game convention
    function toYawPitch(alpha, beta, gamma, orient) {
        euler.set(beta * DEG, alpha * DEG, -gamma * DEG, 'YXZ');
        q.setFromEuler(euler);
        q.multiply(q1);
        q.multiply(q0.setFromAxisAngle(zee, -orient * DEG));
        fwd.set(0, 0, -1).applyQuaternion(q);
        return { yaw: Math.atan2(-fwd.x, -fwd.z), pitch: Math.asin(Math.max(-1, Math.min(1, fwd.y))) };
    }
    const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const soft = d => Math.sign(d) * Math.max(0, Math.abs(d) - DEADZONE);

    function onOrient(e) {
        if (e.alpha === null && e.beta === null) return;   // desktop/no sensor fires an empty event
        gotAny = true; lastEventAt = performance.now();
        if (!settings.gyroEnabled || !gameRunning || gamePaused) { ref = null; return; }
        const raw = toYawPitch(e.alpha || 0, e.beta || 0, e.gamma || 0, screenAngle());
        if (!smooth || !ref) { smooth = { yaw: raw.yaw, pitch: raw.pitch }; ref = { yaw: raw.yaw, pitch: raw.pitch }; return; }
        smooth.yaw   = wrap(smooth.yaw + wrap(raw.yaw - smooth.yaw) * SMOOTH);
        smooth.pitch = smooth.pitch + (raw.pitch - smooth.pitch) * SMOOTH;
        let dYaw = wrap(smooth.yaw - ref.yaw), dPitch = smooth.pitch - ref.pitch;
        // pointing almost straight up/down makes yaw meaningless; ignore yaw there
        if (Math.abs(smooth.pitch) > 1.35) dYaw = 0;
        // a huge single-event jump = sensor glitch / orientation flip: just re-anchor
        if (Math.abs(dYaw) > 0.6 || Math.abs(dPitch) > 0.6) { ref = { yaw: smooth.yaw, pitch: smooth.pitch }; return; }
        const k = settings.gyroSensitivity / 10;           // 10 = 1:1 (turn the phone 30°, view turns 30°)
        yaw   += soft(dYaw) * k;
        pitch += soft(dPitch) * k;
        pitch  = Math.max(-1.4, Math.min(1.4, pitch));
        ref = { yaw: smooth.yaw, pitch: smooth.pitch };
    }

    function listen() {
        if (listening) return;
        listening = true;
        window.addEventListener('deviceorientation', onOrient, true);
    }
    function recenter() { ref = null; smooth = null; }

    return { listen, recenter, toYawPitch, onOrient, get gotAny() { return gotAny; }, get lastEventAt() { return lastEventAt; } };
})();
// re-anchor when the phone flips between the two landscape orientations
if (window.screen && screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', () => Gyro.recenter());
window.addEventListener('orientationchange', () => Gyro.recenter());

function recenterGyro(showNote) {
    Gyro.recenter();
    if (showNote) gyroNote('Recentered: hold the phone how you like to aim');
}
function gyroNote(text) {
    const n = document.getElementById('gyro-note');
    if (n) n.textContent = text;
}

function startGyro() { Gyro.listen(); Gyro.recenter(); }
// Settings saved as ON from an earlier visit: start listening right away
// (Android needs no permission prompt; iOS asks again from the toggle tap).
if (typeof settings !== 'undefined' && settings.gyroEnabled &&
    !(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function')) {
    startGyro();
}

function enableGyro() {
    if (!window.isSecureContext) { gyroNote('Gyro needs a secure (https) page'); return; }
    if (typeof DeviceOrientationEvent === 'undefined') { gyroNote('No motion sensor on this device'); return; }
    const turnOn = () => {
        settings.gyroEnabled = true;
        saveSettings();
        startGyro();
        updateSettingsUI();
        gyroNote('On · hold the phone how you like to aim');
        // no sensor events within 1.5 s = no gyro on this device
        const t0 = performance.now();
        setTimeout(() => { if (!Gyro.gotAny || Gyro.lastEventAt < t0 - 1) gyroNote('No motion data from this device yet'); }, 1500);
    };
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+: must be called straight from the tap
        DeviceOrientationEvent.requestPermission()
            .then(state => { if (state === 'granted') turnOn(); else gyroNote('Motion access was denied (Settings › Safari › Motion & Orientation)'); })
            .catch(() => gyroNote('Motion access needs a tap to allow'));
    } else turnOn();
}

function disableGyro() {
    settings.gyroEnabled = false;
    Gyro.recenter();
    saveSettings();
    updateSettingsUI();
    gyroNote('tilt the phone to aim');
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
