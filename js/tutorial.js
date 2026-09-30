// ── js/tutorial.js ──
// Info slides + guided practice run before first deployment.

const TUT_KEY = 'msc_tut_done';

// ─── SLIDE DATA ───────────────────────────────────────────

const TUT_SLIDES = [
    {
        tag:   '// SIGNAL DETECTED //',
        title: 'WELCOME, OPERATIVE',
        body:  `You are entering <span class="tut-hl">MOOD SHIFT CITY</span> — a hostile urban zone overrun by enemy forces.<br><br>
                Survive endless waves. Eliminate threats. Collect supplies. Push your score as high as possible.<br><br>
                This briefing will prepare you for your first deployment.`
    },
    {
        tag:   '// MOVEMENT &amp; COMBAT //',
        title: 'CONTROLS',
        body:  '__CONTROLS__'
    },
    {
        tag:   '// OPERATIVE SELECTION //',
        title: 'CHOOSE YOUR OPERATIVE',
        body:  `Select your operative in the <span class="tut-hl">INTEL DATABASE</span> on the main menu before deploying.<br><br>
                <div class="tut-table">
                  <div class="tut-row"><span class="tut-badge" style="color:#00ffff;border-color:#00ffff">STRIKER</span><span class="tut-desc">Balanced speed, HP and damage. <strong style="color:rgba(0,255,255,0.7)">Best for new operatives.</strong></span></div>
                  <div class="tut-row"><span class="tut-badge" style="color:#aa00ff;border-color:#aa00ff">ENFORCER</span><span class="tut-desc">160 HP tank with a 3-round burst per trigger. Moves slowly.</span></div>
                  <div class="tut-row"><span class="tut-badge" style="color:#ffff00;border-color:#ffff00">PHANTOM</span><span class="tut-desc">Fastest movement and fire rate. Very low HP — never stop moving.</span></div>
                  <div class="tut-row"><span class="tut-badge" style="color:#00ff88;border-color:#00ff88">MEDIC</span><span class="tut-desc">Passive HP regen and double healing from HP packs. Durable support.</span></div>
                </div>`
    },
    {
        tag:   '// THREAT ASSESSMENT //',
        title: 'KNOW YOUR ENEMIES',
        body:  `<div class="tut-table">
                  <div class="tut-row"><span class="tut-badge" style="color:#ff0040;border-color:#ff0040">RUNNER</span><span class="tut-desc">Charges straight at you. Fast but low HP. Easy target.</span></div>
                  <div class="tut-row"><span class="tut-badge" style="color:#aa00ff;border-color:#aa00ff">TANK</span><span class="tut-desc">Slow, massive HP. Keep your distance and unload everything.</span></div>
                  <div class="tut-row"><span class="tut-badge" style="color:#ffff00;border-color:#ffff00">SCOUT</span><span class="tut-desc">Extremely fast, very fragile. Fire immediately on sight.</span></div>
                  <div class="tut-row"><span class="tut-badge" style="color:#00ff66;border-color:#00ff66">SNIPER</span><span class="tut-desc">Stays at range and fires accurate shots. Keep moving to dodge.</span></div>
                </div>`
    },
    {
        tag:   '// FIELD SUPPLIES //',
        title: 'DROPS &amp; POWERUPS',
        body:  `Enemies drop pickups on death — walk over them to collect.<br><br>
                <div class="tut-table">
                  <div class="tut-row"><span class="tut-dot" style="background:#ff3040;box-shadow:0 0 8px #ff3040"></span><span class="tut-desc"><strong style="color:#ff4466">HP PACK</strong> &mdash; Restores health. Prioritise when below 50%.</span></div>
                  <div class="tut-row"><span class="tut-dot" style="background:#00ffff;box-shadow:0 0 8px #00ffff"></span><span class="tut-desc"><strong style="color:#00ffff">AMMO</strong> &mdash; Refills reserve. Guaranteed when you run critically low.</span></div>
                  <div class="tut-row"><span class="tut-dot" style="background:#ff00ff;box-shadow:0 0 8px #ff00ff"></span><span class="tut-desc"><strong style="color:#ff00ff">SPEED+</strong> &mdash; Move faster for a few seconds.</span></div>
                  <div class="tut-row"><span class="tut-dot" style="background:#0088ff;box-shadow:0 0 8px #0088ff"></span><span class="tut-desc"><strong style="color:#0088ff">SHIELD</strong> &mdash; Block incoming damage for a few seconds.</span></div>
                  <div class="tut-row"><span class="tut-dot" style="background:#ff8800;box-shadow:0 0 8px #ff8800"></span><span class="tut-desc"><strong style="color:#ff8800">RAPID+</strong> &mdash; Increased fire rate for a few seconds.</span></div>
                </div>`
    },
    {
        tag:   '// LIVE TRAINING //',
        title: 'PRACTICE MISSION',
        body:  `Time to test your skills in a <span class="tut-hl">live training area</span>.<br><br>
                You will face a small number of training targets — slower than real enemies.<br><br>
                Follow the on-screen objectives. There is no failure in training.`
    }
];

let tutSlideIdx = 0;

function openTutorial() {
    tutSlideIdx = 0;
    renderTutSlide();
    document.getElementById('tutorial-overlay').style.display = 'flex';
    document.getElementById('menu').style.display = 'none';
}

function skipTutorial() {
    localStorage.setItem(TUT_KEY, 'true');
    document.getElementById('tutorial-overlay').style.display = 'none';
    document.getElementById('menu').style.display = 'flex';
}

function tutNextSlide() {
    if (tutSlideIdx >= TUT_SLIDES.length - 1) {
        document.getElementById('tutorial-overlay').style.display = 'none';
        startTutorialRun();
        return;
    }
    tutSlideIdx++;
    renderTutSlide();
}

function renderTutSlide() {
    const s      = TUT_SLIDES[tutSlideIdx];
    const tot    = TUT_SLIDES.length;
    const isLast = (tutSlideIdx === tot - 1);
    const isTouchDev = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    let body = s.body;
    if (body === '__CONTROLS__') {
        body = isTouchDev
            ? `<div class="tut-table">
                 <div class="tut-row"><span class="tut-key">LEFT THUMB</span><span class="tut-desc">Joystick &mdash; move in any direction</span></div>
                 <div class="tut-row"><span class="tut-key">RIGHT THUMB</span><span class="tut-desc">Drag to aim your weapon</span></div>
                 <div class="tut-row"><span class="tut-key">FIRE</span><span class="tut-desc">Shoot</span></div>
                 <div class="tut-row"><span class="tut-key">RELOAD</span><span class="tut-desc">Reload your weapon</span></div>
                 <div class="tut-row"><span class="tut-key">II</span><span class="tut-desc">Pause / resume the game</span></div>
               </div>`
            : `<div class="tut-table">
                 <div class="tut-row"><span class="tut-key">W A S D</span><span class="tut-desc">Move</span></div>
                 <div class="tut-row"><span class="tut-key">MOUSE</span><span class="tut-desc">Aim</span></div>
                 <div class="tut-row"><span class="tut-key">CLICK</span><span class="tut-desc">Fire</span></div>
                 <div class="tut-row"><span class="tut-key">R</span><span class="tut-desc">Reload your weapon</span></div>
                 <div class="tut-row"><span class="tut-key">ESC</span><span class="tut-desc">Pause / resume the game</span></div>
               </div>`;
    }

    const pips = Array.from({ length: tot }, (_, i) =>
        `<span class="tut-pip${i === tutSlideIdx ? ' tut-pip-on' : ''}"></span>`
    ).join('');

    document.getElementById('tut-slide-area').innerHTML = `
        <div class="tut-tag">${s.tag}</div>
        <div class="tut-title">${s.title}</div>
        <div class="tut-body">${body}</div>
        <div class="tut-btns">
            <button class="tut-skip-btn" onclick="skipTutorial()">SKIP ALL</button>
            <button class="tut-next-btn" onclick="tutNextSlide()">${isLast ? 'ENTER FIELD &#9658;' : 'NEXT &#9658;'}</button>
        </div>
        <div class="tut-progress">${pips}</div>
    `;
}

// ─── PRACTICE RUN ─────────────────────────────────────────

const TUT_PHASES = [
    { hint: 'OBJECTIVE  Move around the training area', timer: 5000 },
    { hint: 'OBJECTIVE  Aim your weapon in different directions', timer: 4000 },
    { hint: 'TARGET DETECTED  Fire to eliminate it!', waitKill: true, spawn: 1 },
    { hint: 'GOOD SHOT  Reload if needed &mdash; R key or RELOAD button', timer: 3500 },
    { hint: 'FINAL TEST  Clear all remaining targets!', waitKill: true, spawn: 2 },
    { hint: '// TRAINING COMPLETE //  Entering wave combat...', timer: 3000, done: true }
];

let tutPhaseIdx  = 0;
let tutPhaseTimer = null;

function startTutorialRun() {
    tutorialMode = true;
    checkDevice();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playerSpeed = 0.20; playerMaxHp = 100; shootCooldown = 150;
    bulletDmg = 50; maxClip = 12; ammo = 12; burstCount = 1;
    hp = 100; reserve = 48; boosts = {};
    document.getElementById('menu').style.display = 'none';
    beginGame();
}

function initTutorialPhases() {
    tutPhaseIdx = 0;
    runTutPhase();
}

function runTutPhase() {
    if (tutPhaseIdx >= TUT_PHASES.length) return;
    const phase = TUT_PHASES[tutPhaseIdx];
    showTutHint(phase.hint);

    if (phase.spawn) spawnTutorialEnemies(phase.spawn);

    if (phase.done) {
        tutPhaseTimer = setTimeout(() => {
            hideTutHint();
            localStorage.setItem(TUT_KEY, 'true');
            tutorialMode = false;
            exitToMenu();
        }, phase.timer);
        return;
    }

    if (phase.waitKill) {
        pollForTutKill();
        return;
    }

    tutPhaseTimer = setTimeout(() => {
        tutPhaseIdx++;
        runTutPhase();
    }, phase.timer);
}

function pollForTutKill() {
    if (!gameRunning) return;
    if (enemies.length === 0) {
        tutPhaseIdx++;
        runTutPhase();
        return;
    }
    requestAnimationFrame(pollForTutKill);
}

function spawnTutorialEnemies(count) {
    for (let i = 0; i < count; i++) {
        let angle = (Math.PI * 2 / count) * i + 0.4;
        let dist  = 18 + Math.random() * 8;
        let ex = player.position.x + Math.cos(angle) * dist;
        let ez = player.position.z + Math.sin(angle) * dist;
        let att = 0;
        while (isPositionInBuilding(ex, ez, 0.8) && att < 12) {
            angle = Math.random() * Math.PI * 2;
            ex = player.position.x + Math.cos(angle) * dist;
            ez = player.position.z + Math.sin(angle) * dist;
            att++;
        }
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 2.16, 1.2),
            new THREE.MeshStandardMaterial({ color: 0xff0040, emissive: 0xff0040, emissiveIntensity: 0.8 })
        );
        mesh.position.set(ex, 1.08, ez);
        scene.add(mesh);
        enemies.push({
            mesh, hp: 80, speed: 0.025, size: 1.2,
            behavior: 'normal', strafeDir: 1,
            nextStrafeChange: Date.now() + 99999,
            shootInterval: 0, bulletSpeed: 0, bulletDamage: 0,
            bulletRange: 0, preferredDist: 0, lastEnemyShot: 0
        });
    }
}

function showTutHint(rawText) {
    const el = document.getElementById('tut-hint');
    if (!el) return;
    const parts = rawText.split('  ');
    el.innerHTML = parts.length >= 2
        ? `<span style="color:#00ffff;letter-spacing:3px">${parts[0]}</span><span style="color:rgba(255,255,255,0.3)"> ─ </span>${parts.slice(1).join('  ')}`
        : rawText;
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
}

function hideTutHint() {
    const el = document.getElementById('tut-hint');
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-10px)';
}
