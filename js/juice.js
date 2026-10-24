// ── js/juice.js ──
// Game feel + progression layer: hold-to-fire, headshots & damage numbers,
// streak callouts, combo meter (up to x8), perk picks between waves,
// levels that unlock gun skins and perks, the run-over screen with one-tap
// PLAY AGAIN, and a layered WebAudio sound kit with mute.

const Juice = (() => {
    const $ = id => document.getElementById(id);

    // ─────────────────────────── LEVELS & UNLOCKS ───────────────────────────
    const SKINS = [
        { id: 'sunbeam',  name: 'SUNBEAM',     color: 0xfff4e2, lvl: 1 },
        { id: 'mint',     name: 'MINT',        color: 0x7fd6a4, lvl: 2 },
        { id: 'tide',     name: 'TIDE',        color: 0x7cc3d6, lvl: 4 },
        { id: 'golden',   name: 'GOLDEN HOUR', color: 0xffc857, lvl: 6 },
        { id: 'lilac',    name: 'LILAC',       color: 0xc6a2f0, lvl: 8 },
        { id: 'midnight', name: 'MIDNIGHT',    color: 0x3a2733, lvl: 10 }
    ];
    const PERK_UNLOCKS = { vamp: 3, luck: 5, twin: 7 };
    function xpForLevel(L) { return 100 * (L - 1) * L; }           // L1 0, L2 200, L3 600, L4 1200, L5 2000…
    function levelFor(xp) { let L = 1; while (xp >= xpForLevel(L + 1)) L++; return L; }
    function unlocksAt(L) {
        const out = SKINS.filter(s => s.lvl === L).map(s => s.name + ' SKIN');
        for (const k in PERK_UNLOCKS) if (PERK_UNLOCKS[k] === L) out.push(PERKS[k].name + ' PERK');
        return out;
    }
    function nextUnlock(L) {
        for (let n = L + 1; n <= 30; n++) { const u = unlocksAt(n); if (u.length) return { lvl: n, what: u[0] }; }
        return null;
    }
    let skinId = localStorage.getItem('msc_skin') || 'sunbeam';
    // The skin you actually play with: the selected one if unlocked, otherwise
    // the best skin you have unlocked (never silently back to SUNBEAM).
    function currentSkin() {
        const L = levelFor(playerXP);
        const s = SKINS.find(x => x.id === skinId);
        if (s && s.lvl <= L) return s;
        return SKINS.filter(x => x.lvl <= L).pop() || SKINS[0];
    }
    // Arrows step through every skin by the selected one's own position (the old
    // code stepped from currentSkin(), which jumps back to SUNBEAM on a locked
    // skin, so the arrows got stuck bouncing between the same 2-3 skins).
    // Locked skins are shown as a preview with their unlock level; play keeps
    // your best unlocked skin until you reach that level.
    function cycleSkin(dir) {
        let i = SKINS.findIndex(s => s.id === skinId);
        if (i < 0) i = 0;
        i = (i + dir + SKINS.length) % SKINS.length;
        skinId = SKINS[i].id;
        localStorage.setItem('msc_skin', skinId);
        sfx.ui();
        renderMenuProgress();
    }

    // ─────────────────────────── PERKS ───────────────────────────
    const PERKS = {
        dmg:    { name: 'HOLLOW POINTS', icon: '✦', desc: '+25% damage',                apply() { bulletDmg = Math.round(bulletDmg * 1.25); } },
        rof:    { name: 'HAIR TRIGGER',  icon: '❖', desc: '+20% fire rate',             apply() { shootCooldown = Math.max(40, shootCooldown * 0.8); } },
        mag:    { name: 'DEEP MAG',      icon: '▤', desc: '+50% magazine, refilled',   apply() { maxClip = Math.ceil(maxClip * 1.5); ammo = maxClip; } },
        hp:     { name: 'THICK SKIN',    icon: '♥', desc: '+25 max HP and heal 25',     apply() { playerMaxHp += 25; hp = Math.min(playerMaxHp, hp + 25); } },
        spd:    { name: 'FLEET FOOT',    icon: '➶', desc: '+12% move speed',            apply() { playerSpeed *= 1.12; } },
        heal:   { name: 'PATCH UP',      icon: '✚', desc: 'Heal to full right now',     apply() { hp = playerMaxHp; }, when: () => hp < playerMaxHp * 0.7 },
        rocket: { name: 'PAYLOAD',       icon: '✹', desc: '+3 rockets [F]',             apply() { hasSecondaryWeapon = true; secondaryAmmo += 3; } },
        head:   { name: 'DEADEYE',       icon: '◎', desc: 'Headshots deal x3 (not x2)', apply() { run.headMult = 3; }, once: true },
        magnet: { name: 'MAGNET',        icon: '⊛', desc: 'Grab pickups from 2x farther', apply() { run.pickup *= 2; }, once: true },
        combo:  { name: 'LONG FUSE',     icon: '⧗', desc: 'Combo window +1s',           apply() { run.comboWin += 1000; } },
        ammo:   { name: 'BANDOLIER',     icon: '≡', desc: 'Max reserve ammo',           apply() { reserve = MAX_RESERVE; } },
        vamp:   { name: 'VAMPIRE',       icon: '☾', desc: '+3 HP on every kill',        apply() { run.vamp += 3; } },
        luck:   { name: 'LUCKY',         icon: '☘', desc: 'Enemies drop loot more',     apply() { run.drop = Math.min(0.85, run.drop + 0.15); } },
        twin:   { name: 'TWIN SHOT',     icon: '⁑', desc: 'Every shot fires 2 bullets', apply() { run.twin = true; }, once: true }
    };

    // ─────────────────────────── PER-RUN STATE ───────────────────────────
    const run = {};
    function resetRun() {
        Object.assign(run, {
            headMult: 2, pickup: 2.0, comboWin: 2600, vamp: 0, drop: 0.5, twin: false,
            perks: {}, bestStreak: 0, streak: 0, comboExpire: 0, headshots: 0,
            beatBest: false, startBest: highScore, firing: false, lowHpBeat: 0
        });
        comboCount = 0; comboMultiplier = 1;
        Toon.setGunSkin(currentSkin().color);
    }

    // ─────────────────────────── AUDIO ───────────────────────────
    let muted = localStorage.getItem('msc_muted') === 'true';
    window.MSC_MUTED = muted;
    let A = null, out = null, noiseBuf = null, amb = null;
    function ac() {
        try {
            const c = (typeof AudioEngine !== 'undefined') ? AudioEngine.context : null;
            if (!c) return null;
            if (A !== c) {
                A = c; out = c.createGain(); out.connect(c.destination);
                const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
                out.disconnect(); out.connect(comp); comp.connect(c.destination);
                noiseBuf = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
                const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            }
            out.gain.value = muted ? 0 : (settings.masterVolume / 100);
            return A;
        } catch (e) { return null; }
    }
    function tone(freq, type, dur, vol, opts = {}) {
        const c = ac(); if (!c) return;
        const t = c.currentTime + (opts.delay || 0);
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.004));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(opts.dest || out);
        o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, vol, filt = 'bandpass', freq = 1500, q = 1, opts = {}) {
        const c = ac(); if (!c) return;
        const t = c.currentTime + (opts.delay || 0);
        const s = c.createBufferSource(); s.buffer = noiseBuf;
        const f = c.createBiquadFilter(); f.type = filt; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
        if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(out);
        s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    }
    const sfx = {
        shot(kind) {
            const r = 0.94 + Math.random() * 0.12;
            if (kind === 'enforcer') {         // shotgun: deep boom + wide noise
                noise(0.32, 0.55, 'lowpass', 2400 * r, 0.7, { to: 300 });
                tone(120 * r, 'sine', 0.25, 0.6, { to: 45 });
                noise(0.03, 0.4, 'highpass', 4000);
            } else if (kind === 'phantom') {   // snappy SMG
                noise(0.07, 0.35, 'bandpass', 3200 * r, 0.9);
                tone(720 * r, 'square', 0.05, 0.12, { to: 260 });
            } else if (kind === 'medic') {     // soft pulse rifle
                tone(880 * r, 'triangle', 0.12, 0.22, { to: 330 });
                noise(0.08, 0.2, 'bandpass', 2000 * r, 1.4);
            } else {                           // striker: punchy rifle
                noise(0.12, 0.45, 'bandpass', 1800 * r, 0.8, { to: 700 });
                tone(190 * r, 'sine', 0.14, 0.45, { to: 60 });
                noise(0.02, 0.35, 'highpass', 5000);
            }
        },
        hit()      { tone(1900, 'square', 0.035, 0.09); tone(2600, 'sine', 0.05, 0.08, { delay: 0.008 }); },
        head()     { tone(2400, 'sine', 0.16, 0.22); tone(3600, 'sine', 0.2, 0.12, { delay: 0.03 }); },
        kill(n)    {                                    // the "pop", rising a semitone per chained kill
            const p = Math.pow(2, Math.min(n - 1, 14) / 12);
            tone(520 * p, 'sine', 0.09, 0.32, { to: 1300 * p });
            noise(0.06, 0.25, 'highpass', 2500);
            tone(1040 * p, 'triangle', 0.12, 0.12, { delay: 0.04 });
        },
        streak()   { [0, 4, 7, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 'triangle', 0.18, 0.16, { delay: i * 0.055 })); },
        waveStart(boss) {
            if (boss) { tone(70, 'sawtooth', 0.9, 0.25, { to: 50 }); tone(140, 'square', 0.6, 0.08, { delay: 0.15 }); return; }
            tone(392, 'triangle', 0.14, 0.18); tone(523, 'triangle', 0.2, 0.18, { delay: 0.12 });
        },
        waveClear() { [0, 4, 7, 11, 12].forEach((s, i) => tone(440 * Math.pow(2, s / 12), 'sine', 0.3, 0.16, { delay: i * 0.07 })); noise(0.5, 0.08, 'highpass', 6000, 0.5, { delay: 0.3 }); },
        perk()     { tone(660, 'triangle', 0.12, 0.2); tone(990, 'triangle', 0.18, 0.18, { delay: 0.08 }); },
        levelUp()  { [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 'triangle', 0.35, 0.16, { delay: i * 0.08 })); },
        heartbeat(){ tone(62, 'sine', 0.14, 0.5); tone(55, 'sine', 0.16, 0.42, { delay: 0.18 }); },
        ui()       { tone(1200, 'triangle', 0.05, 0.12, { to: 800 }); },
        hurt()     { tone(160, 'sawtooth', 0.16, 0.16, { to: 70 }); noise(0.12, 0.2, 'lowpass', 900); },
        best()     { [0, 4, 7, 12, 16].forEach((s, i) => tone(587 * Math.pow(2, s / 12), 'square', 0.12, 0.07, { delay: i * 0.06 })); }
    };
    // Subtle ambient bed: wind-like filtered noise + a soft low chord
    function startAmbient() {
        const c = ac(); if (!c || amb) return;
        const g = c.createGain(); g.gain.value = 0.0001; g.connect(out);
        const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.6;
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 160;
        lfo.connect(lg); lg.connect(f.frequency);
        s.connect(f); f.connect(g);
        const oscs = [110, 164.8, 220.0].map(fr => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fr; const og = c.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(g); o.start(); return o; });
        s.start(); lfo.start();
        g.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 2.5);
        amb = { g, s, lfo, oscs };
    }
    function stopAmbient() {
        if (!amb || !A) return;
        const a = amb; amb = null;
        try {
            a.g.gain.cancelScheduledValues(A.currentTime);
            a.g.gain.setValueAtTime(Math.max(0.0001, a.g.gain.value), A.currentTime);
            a.g.gain.exponentialRampToValueAtTime(0.0001, A.currentTime + 0.6);
            setTimeout(() => { try { a.s.stop(); a.lfo.stop(); a.oscs.forEach(o => o.stop()); a.g.disconnect(); } catch (e) {} }, 700);
        } catch (e) {}
    }
    function setMuted(m) {
        muted = m; window.MSC_MUTED = m;
        localStorage.setItem('msc_muted', m);
        if (typeof AudioEngine !== 'undefined') AudioEngine.updateVolume();
        ac();
        document.querySelectorAll('.mute-btn').forEach(b => { b.textContent = m ? '🔇' : '🔊'; b.classList.toggle('is-muted', m); });
    }
    function toggleMute() { setMuted(!muted); if (!muted) sfx.ui(); }

    // ─────────────────────────── FEEDBACK UI ───────────────────────────
    const _v = new THREE.Vector3();
    function toScreen(pos) {
        _v.copy(pos).project(camera);
        if (_v.z > 1) return null;
        return { x: (_v.x + 1) / 2 * window.innerWidth, y: (1 - _v.y) / 2 * window.innerHeight };
    }
    function dmgNumber(pos, dmg, head) {
        const p = toScreen(pos); if (!p) return;
        const layer = $('feedback-layer'); if (!layer) return;
        if (layer.childElementCount > 24) layer.firstElementChild.remove();
        const el = document.createElement('div');
        el.className = 'dmg-num' + (head ? ' head' : '');
        el.textContent = Math.round(dmg);
        el.style.left = (p.x + (Math.random() - 0.5) * 30) + 'px';
        el.style.top = (p.y - 20) + 'px';
        el.style.setProperty('--dx', ((Math.random() - 0.5) * 60).toFixed(0) + 'px');
        layer.appendChild(el);
        setTimeout(() => el.remove(), 750);
    }
    function scorePop(pos, pts, mult) {
        const p = toScreen(pos) || { x: innerWidth / 2, y: innerHeight / 2 - 60 };
        const layer = $('feedback-layer'); if (!layer) return;
        const el = document.createElement('div');
        el.className = 'score-pop';
        el.innerHTML = '+' + pts + (mult > 1 ? ' <small>x' + mult + '</small>' : '');
        el.style.left = p.x + 'px'; el.style.top = (p.y - 50) + 'px';
        layer.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    }
    let calloutTimer = null, calloutPri = 0;
    function callout(text, sub, pri = 1, cls = '') {
        const el = $('callout'); if (!el) return;
        if (pri < calloutPri && el.classList.contains('show')) return;
        calloutPri = pri;
        el.className = cls;
        el.innerHTML = `<div class="co-main">${text}</div>` + (sub ? `<div class="co-sub">${sub}</div>` : '');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(calloutTimer);
        calloutTimer = setTimeout(() => { el.classList.remove('show'); calloutPri = 0; }, pri >= 3 ? 1600 : 1100);
    }
    function bumpScore() {
        const el = $('score-val'); if (!el) return;
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    }

    // ─────────────────────────── GAME HOOKS ───────────────────────────
    function onShoot() {
        sfx.shot(selectedChar);
        Toon.gunFire(burstCount > 1 ? 1.5 : 1);
    }
    // Returns the damage to apply; handles headshot bonus + feedback
    function onHit(e, pos, dir, baseDmg) {
        const head = Toon.isHeadshot(e, pos, dir);
        const dmg = head ? baseDmg * run.headMult : baseDmg;
        if (head) { run.headshots++; sfx.head(); } else sfx.hit();
        dmgNumber(pos, dmg, head);
        if (typeof triggerHitMarker === 'function') triggerHitMarker(head);
        Toon.burst(pos, 'enemy', head ? 6 : 3, 0.5);
        if (head && e.hp - dmg <= 0) e._headKill = true;
        return dmg;
    }
    function onKill(e) {
        const now = performance.now();
        if (now > run.comboExpire) comboCount = 0;
        comboCount++;
        run.comboExpire = now + run.comboWin;
        run.streak = comboCount;
        run.bestStreak = Math.max(run.bestStreak, comboCount);
        const n = comboCount;
        comboMultiplier = n >= 16 ? 8 : n >= 12 ? 6 : n >= 9 ? 5 : n >= 6 ? 4 : n >= 4 ? 3 : n >= 2 ? 2 : 1;

        const pts = (e.isBoss ? 500 * wave : 50) * comboMultiplier;
        score += pts;
        bumpScore();
        scorePop(e.mesh.position.clone().setY(e.mesh.position.y + (e.size || 1)), pts, comboMultiplier);
        sfx.kill(n);
        if (run.vamp && hp > 0) hp = Math.min(playerMaxHp, hp + run.vamp);

        // Confetti + pop ring
        const p = e.mesh.position.clone();
        Toon.burst(p, 'enemy', e.isBoss ? 140 : 30 + Math.min(20, n * 2), e.isBoss ? 2 : 1);
        Toon.ringPop(p, e.isBoss ? 3 : (e.size || 1), 0xfff4e2);
        shakeAmount = Math.max(shakeAmount, e.isBoss ? 0.7 : 0.16);

        // Callouts
        if (e.isBoss) { callout('BOSS DOWN', '+' + pts, 4, 'gold'); sfx.streak(); }
        else if (n === 2) callout('DOUBLE KILL', 'x' + comboMultiplier + ' combo', 2);
        else if (n === 3) callout('TRIPLE KILL', 'x' + comboMultiplier + ' combo', 2);
        else if (n === 4) callout('QUAD KILL', 'x' + comboMultiplier + ' combo', 2);
        else if (n === 5) { callout('RAMPAGE', 'STREAK x5', 3); sfx.streak(); }
        else if (n === 10) { callout('UNSTOPPABLE', 'STREAK x10', 3, 'gold'); sfx.streak(); }
        else if (n === 15) { callout('GODLIKE', 'STREAK x15', 3, 'gold'); sfx.streak(); }
        else if (n > 15 && n % 5 === 0) { callout('STREAK x' + n, 'x' + comboMultiplier + ' combo', 3, 'gold'); sfx.streak(); }
        else if (e._headKill) callout('HEADSHOT', null, 1, 'small');

        if (!run.beatBest && run.startBest > 0 && score > run.startBest) {
            run.beatBest = true;
            setTimeout(() => { callout('NEW HIGH SCORE', 'keep going', 5, 'gold'); sfx.best(); }, 350);
        }
        return pts;
    }
    function dropChance() { return run.drop; }
    function pickupRadius() { return run.pickup; }
    function extraShots() { return run.twin; }
    function onPlayerHit() { sfx.hurt(); }

    function update() {
        const now = performance.now();
        // hold-to-fire
        if (run.firing && gameRunning && !gamePaused) shoot();
        // combo decay
        if (comboCount > 0 && now > run.comboExpire) { comboCount = 0; comboMultiplier = 1; }
        const meter = $('combo-meter-fill');
        if (meter) {
            const left = comboCount > 0 ? Math.max(0, (run.comboExpire - now) / run.comboWin) : 0;
            meter.style.transform = 'scaleX(' + left.toFixed(3) + ')';
            $('combo-meter').classList.toggle('on', comboMultiplier > 1);
        }
        // low HP heartbeat + vignette
        const low = hp > 0 && hp < playerMaxHp * 0.3;
        document.body.classList.toggle('low-hp', low);
        if (low && now > run.lowHpBeat) { sfx.heartbeat(); run.lowHpBeat = now + 900; }
        Toon.update();
    }

    // ─────────────────────────── WAVES & PERKS ───────────────────────────
    let picking = false, offered = [];
    function onWaveStart(num, boss) {
        sfx.waveStart(boss);
        const el = $('wave-status');
        callout(boss ? 'BOSS WAVE' : 'WAVE ' + num, boss ? 'the Overlord is coming' : (currentWaveModifier ? ({ blitz: 'BLITZ · all scouts', siege: 'SIEGE · snipers only', armored: 'ARMORED · double HP', swarm: 'SWARM · double count' }[currentWaveModifier] || currentWaveModifier) : (num === 1 ? 'survive. chain kills. go.' : 'tougher this time')), 2, boss ? 'gold' : '');
    }
    function onWaveCleared() {
        if (tutorialMode) { startWave(wave + 1); return; }
        isWaveTransition = true;
        sfx.waveClear();
        callout('WAVE ' + wave + ' CLEARED', '+' + (wave * 100) + ' bonus', 4);
        const gen = runGen;
        setTimeout(() => { if (gen === runGen && gameRunning) showPerks(); }, 1100);
    }
    function availablePerks() {
        const L = levelFor(playerXP);
        return Object.keys(PERKS).filter(k => {
            const p = PERKS[k];
            if (PERK_UNLOCKS[k] && L < PERK_UNLOCKS[k]) return false;
            if (p.once && run.perks[k]) return false;
            if (p.when && !p.when()) return false;
            return true;
        });
    }
    function showPerks() {
        const pool = availablePerks();
        offered = [];
        while (offered.length < 3 && pool.length) offered.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
        const auto = (typeof NEXUS !== 'undefined' && NEXUS.on) || (document.getElementById('nexus-train-hud') && getComputedStyle($('nexus-train-hud')).display !== 'none');
        if (auto) { pickPerk(0, true); return; }
        picking = true;
        gamePaused = true;
        run.firing = false;
        stopAmbient();
        if (!isMobile && document.pointerLockElement) document.exitPointerLock();
        const m = $('perk-modal');
        m.innerHTML = `<div class="perk-head"><div class="perk-kicker">WAVE ${wave} CLEARED</div><div class="perk-title">Pick a perk</div></div>
            <div class="perk-cards">${offered.map((k, i) => {
                const p = PERKS[k], n = run.perks[k] || 0;
                return `<button class="perk-card" data-i="${i}" style="--d:${i * 70}ms">
                    <span class="perk-key">${isMobile ? '' : (i + 1)}</span>
                    <span class="perk-icon">${p.icon}</span>
                    <span class="perk-name">${p.name}${n ? ' <em>+' + (n + 1) + '</em>' : ''}</span>
                    <span class="perk-desc">${p.desc}</span></button>`;
            }).join('')}</div>`;
        m.querySelectorAll('.perk-card').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); pickPerk(+b.dataset.i); }));
        m.classList.add('show');
    }
    function pickPerk(i, silent) {
        const k = offered[i]; if (!k) return;
        PERKS[k].apply();
        run.perks[k] = (run.perks[k] || 0) + 1;
        offered = [];
        if (!silent) sfx.perk();
        const m = $('perk-modal'); m.classList.remove('show');
        if (picking) {
            picking = false;
            gamePaused = false;
            if (!isMobile) document.body.requestPointerLock();
            startAmbient();
            animate();
        }
        startWave(wave + 1);
    }

    // ─────────────────────────── RUN OVER ───────────────────────────
    function showGameOver(d) {
        run.firing = false;
        stopAmbient();
        document.body.classList.remove('low-hp');
        if (!isMobile && document.pointerLockElement) document.exitPointerLock();
        const oldL = levelFor(d.oldXP), newL = levelFor(d.newXP);
        const unlocked = [];
        for (let L = oldL + 1; L <= newL; L++) unlocked.push(...unlocksAt(L));
        const nu = nextUnlock(newL);
        const lvlStart = xpForLevel(newL), lvlEnd = xpForLevel(newL + 1);
        const pctNow = Math.min(100, (d.newXP - lvlStart) / (lvlEnd - lvlStart) * 100);
        const pctOld = newL > oldL ? 0 : Math.min(100, (d.oldXP - lvlStart) / (lvlEnd - lvlStart) * 100);
        const short = (!d.isBest && d.prevBest > 0) ? d.prevBest - d.score : 0;
        const tease = d.isBest ? 'NEW PERSONAL BEST' :
            (short > 0 && short <= Math.max(300, d.prevBest * 0.25)) ? `only ${short.toLocaleString()} short of your best` :
            nu ? `${(xpForLevel(nu.lvl) - d.newXP).toLocaleString()} XP to unlock ${nu.what}` : 'max level. legend.';
        const perkList = Object.keys(run.perks).map(k => `<span class="go-perk">${PERKS[k].icon} ${PERKS[k].name}${run.perks[k] > 1 ? ' x' + run.perks[k] : ''}</span>`).join('');
        const el = $('gameover');
        el.innerHTML = `
          <div id="go-card" class="${d.isBest ? 'is-best' : ''}">
            <div class="go-kicker">RUN OVER · WAVE ${d.wave}</div>
            <div class="go-score" id="go-score">0</div>
            <div class="go-tease">${tease}</div>
            <div class="go-row">
              <div><b>${d.kills}</b><span>kills</span></div>
              <div><b>x${run.bestStreak}</b><span>best streak</span></div>
              <div><b>${run.headshots}</b><span>headshots</span></div>
              <div><b>${d.acc}%</b><span>accuracy</span></div>
              <div><b>${d.time}</b><span>survived</span></div>
              <div><b>${d.best.toLocaleString()}</b><span>best</span></div>
            </div>
            ${perkList ? `<div class="go-perks">${perkList}</div>` : ''}
            <div class="go-xp">
              <div class="go-xp-top"><span>LVL <b id="go-lvl">${newL > oldL ? oldL : newL}</b> · ${d.rank}</span><span>+${d.xp} XP</span></div>
              <div class="go-xp-track"><div class="go-xp-fill" id="go-xp-fill" style="width:${pctOld}%"></div></div>
              <div class="go-unlock" id="go-unlock"></div>
            </div>
            <button id="go-again" class="go-again">▶ PLAY AGAIN</button>
            <button id="go-menu" class="go-menu">MENU</button>
            <div class="go-hint">${isMobile ? '' : 'SPACE to play again'}</div>
          </div>`;
        el.style.display = 'flex';
        requestAnimationFrame(() => el.classList.add('show'));
        $('go-again').addEventListener('click', e => { e.stopPropagation(); restartRun(); });
        $('go-menu').addEventListener('click', e => { e.stopPropagation(); sfx.ui(); exitToMenu(); });

        // score count-up
        const t0 = performance.now(), dur = 900, target = d.score, scEl = $('go-score');
        (function tick() {
            const k = Math.min(1, (performance.now() - t0) / dur);
            scEl.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString();
            if (k < 1 && el.style.display === 'flex') requestAnimationFrame(tick);
        })();
        // xp fill + level-up reveal
        setTimeout(() => {
            const f = $('go-xp-fill'); if (!f) return;
            if (newL > oldL) {
                f.style.width = '100%';
                setTimeout(() => {
                    $('go-lvl').textContent = newL;
                    f.style.transition = 'none'; f.style.width = '0%'; void f.offsetWidth;
                    f.style.transition = ''; f.style.width = pctNow + '%';
                    $('go-unlock').innerHTML = `<b>LEVEL UP!</b> ${unlocked.length ? 'Unlocked: ' + unlocked.join(', ') : ''}`;
                    $('go-unlock').classList.add('show');
                    sfx.levelUp();
                }, 650);
            } else {
                f.style.width = pctNow + '%';
            }
        }, 500);
        if (d.isBest) setTimeout(() => sfx.best(), 300);
        renderMenuProgress();
    }

    function restartRun() {
        sfx.ui();
        runGen++;
        const el = $('gameover'); el.classList.remove('show'); el.style.display = 'none';
        enemies.forEach(e => disposeMesh(e.mesh)); bullets.forEach(b => disposeMesh(b.mesh));
        enemyBullets.forEach(b => disposeMesh(b.mesh)); drops.forEach(d => disposeMesh(d.mesh));
        enemies.length = 0; bullets.length = 0; enemyBullets.length = 0; drops.length = 0;
        buildings.length = 0; particles.length = 0; killFeedEntries.length = 0;
        score = 0; wave = 0; enemiesToSpawn = 0; isWaveTransition = false; gamePaused = false;
        isBossWave = false; currentWaveModifier = null; isReloading = false; lastShotTime = 0;
        shakeAmount = 0; damageFlashAmount = 0; chromaAmount = 0; yaw = 0; pitch = 0; tutorialMode = false;
        const bb = $('boss-bar-wrapper'); if (bb) bb.style.display = 'none';
        startGame();
    }

    // ─────────────────────────── MENU PROGRESS ───────────────────────────
    function renderMenuProgress() {
        const L = levelFor(playerXP), a = xpForLevel(L), b = xpForLevel(L + 1);
        const lv = $('menu-level'); if (lv) lv.textContent = L;
        const bar = $('menu-level-fill'); if (bar) bar.style.width = Math.min(100, (playerXP - a) / (b - a) * 100).toFixed(1) + '%';
        const nx = $('menu-next'); const nu = nextUnlock(L);
        if (nx) nx.textContent = nu ? `${(xpForLevel(nu.lvl) - playerXP).toLocaleString()} XP → ${nu.what}` : 'everything unlocked';
        const sk = $('skin-name'), sw = $('skin-swatch');
        const want = SKINS.find(s => s.id === skinId) || SKINS[0];
        if (sk) sk.innerHTML = want.lvl <= L ? want.name : `${want.name} <small>🔒 LVL ${want.lvl} · using ${currentSkin().name}</small>`;
        if (sw) { sw.style.background = '#' + want.color.toString(16).padStart(6, '0'); sw.classList.toggle('locked', want.lvl > L); }
        const hs = $('menu-hs'); if (hs) hs.textContent = highScore.toLocaleString();
    }

    // ─────────────────────────── INPUT ───────────────────────────
    function bindInput() {
        document.addEventListener('mousedown', e => { if (e.button === 0 && gameRunning && !isMobile && !gamePaused) run.firing = true; });
        document.addEventListener('mouseup', () => { run.firing = false; });
        window.addEventListener('blur', () => { run.firing = false; });
        const fire = $('fire-btn');
        if (fire) {
            fire.addEventListener('touchstart', () => { run.firing = true; fire.classList.add('held'); }, { passive: true });
            const up = () => { run.firing = false; fire.classList.remove('held'); };
            fire.addEventListener('touchend', up); fire.addEventListener('touchcancel', up);
        }
        document.addEventListener('keydown', e => {
            const k = e.key.toLowerCase();
            if (picking && ['1', '2', '3'].includes(k)) { pickPerk(+k - 1); return; }
            if (k === 'm') toggleMute();
            const go = $('gameover');
            if ((k === ' ' || k === 'enter') && go && go.style.display === 'flex' && !gameRunning) { e.preventDefault(); restartRun(); }
        });
        document.querySelectorAll('.mute-btn').forEach(b => b.addEventListener('click', ev => { ev.stopPropagation(); toggleMute(); }));
        document.querySelectorAll('.mute-btn').forEach(b => b.addEventListener('touchstart', ev => { ev.stopPropagation(); }, { passive: true }));
        setMuted(muted);
    }

    function onRunStart() {
        resetRun();
        document.body.classList.add('in-run');
        startAmbient();
    }
    function onPause(p) { if (p) { run.firing = false; stopAmbient(); } else startAmbient(); }

    document.addEventListener('DOMContentLoaded', () => {});
    bindInput();
    resetRun();
    renderMenuProgress();

    return { onShoot, onHit, onKill, onWaveStart, onWaveCleared, onPlayerHit, onRunStart, onPause, update,
             showGameOver, restartRun, dropChance, pickupRadius, extraShots, cycleSkin, renderMenuProgress,
             toggleMute, levelFor, xpForLevel, get picking() { return picking; }, sfx, run };
})();
