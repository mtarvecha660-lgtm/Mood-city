// ── js/controls.js ──
// Keyboard, mouse (pointer-lock) and touch (joystick + look) input.

let joystick  = { active: false, x: 0, y: 0, touchId: null };
let lookTouch = { active: false, id: null, lastX: 0, lastY: 0 };

function setupControls() {
    // ── Keyboard ──
    document.addEventListener('keydown', e => {
        keys[e.key.toLowerCase()] = true;
        if (e.key.toLowerCase() === 'r') reload();
        if (e.key.toLowerCase() === 'f') fireSecondary();
    });
    document.addEventListener('keyup', e => {
        keys[e.key.toLowerCase()] = false;
    });

    // ── Mouse (desktop pointer-lock) ──
    document.addEventListener('mousedown', () => {
        if (gameRunning && !isMobile) shoot();
    });
    document.addEventListener('mousemove', e => {
        if (!gameRunning || isMobile || document.pointerLockElement !== document.body) return;
        const sens = settings.lookSensitivity * 0.00028;
        yaw   -= e.movementX * sens;
        pitch -= e.movementY * sens;
        pitch  = Math.max(-1.4, Math.min(1.4, pitch));
    });

    // ── Touch: joystick (left half) + look (right half) ──
    window.addEventListener('touchstart', e => {
        for (let t of e.changedTouches) {
            if (t.clientX < window.innerWidth / 2) {
                joystick.active  = true;
                joystick.touchId = t.identifier;
            } else {
                lookTouch.active = true;
                lookTouch.id     = t.identifier;
                lookTouch.lastX  = t.clientX;
                lookTouch.lastY  = t.clientY;
            }
        }
    }, { passive: false });

    window.addEventListener('touchmove', e => {
        for (let t of e.changedTouches) {
            if (joystick.active && t.identifier === joystick.touchId) {
                let dx   = t.clientX - 100;
                let dy   = t.clientY - (window.innerHeight - 100);
                let dist = Math.min(Math.hypot(dx, dy), 60);
                let ang  = Math.atan2(dy, dx);
                joystick.x = (Math.cos(ang) * dist) / 60;
                joystick.y = (Math.sin(ang) * dist) / 60;
                document.getElementById('joystick-knob').style.transform =
                    `translate(${joystick.x * 40}px, ${joystick.y * 40}px)`;
            } else if (lookTouch.active && t.identifier === lookTouch.id) {
                const sens = settings.lookSensitivity * 0.001;
                yaw   -= (t.clientX - lookTouch.lastX) * sens;
                pitch -= (t.clientY - lookTouch.lastY) * sens;
                pitch  = Math.max(-1.4, Math.min(1.4, pitch));
                lookTouch.lastX = t.clientX;
                lookTouch.lastY = t.clientY;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', e => {
        for (let t of e.changedTouches) {
            if (t.identifier === joystick.touchId) {
                joystick.active = false; joystick.x = 0; joystick.y = 0;
                document.getElementById('joystick-knob').style.transform = 'translate(0,0)';
            }
            if (t.identifier === lookTouch.id) lookTouch.active = false;
        }
    });

    // ── On-screen buttons ──
    document.getElementById('fire-btn').addEventListener('touchstart',   e => { e.preventDefault(); shoot();         });
    document.getElementById('reload-btn').addEventListener('touchstart',  e => { e.preventDefault(); reload();        });
    document.getElementById('rocket-btn').addEventListener('touchstart',  e => { e.preventDefault(); fireSecondary(); });
}
