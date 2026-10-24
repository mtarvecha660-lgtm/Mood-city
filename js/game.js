// ── js/game.js ──
// World setup, game loop, enemies, bullets, particles, drops, waves, HUD.

// ── Character definitions ──
const CHARS = {
    striker:  { speed: 0.20, maxHp: 100, cooldown: 150, dmg: 50, clip: 12, reserve: 48, burst: 1 },
    enforcer: { speed: 0.13, maxHp: 160, cooldown: 280, dmg: 40, clip:  8, reserve: 32, burst: 3 },
    phantom:  { speed: 0.28, maxHp:  70, cooldown:  85, dmg: 28, clip: 20, reserve: 72, burst: 1 },
    medic:    { speed: 0.17, maxHp: 110, cooldown: 200, dmg: 35, clip: 10, reserve: 40, burst: 1 }
};

// ── CODEX data ──
const CODEX_DATA = {
    operatives: [
        {
            id: 'striker', color: 0x00ffff, hex: '#00ffff', modelSize: [1.0, 1.8, 1.0],
            name: 'STRIKER', tag: 'BALANCED OPERATIVE',
            desc: 'Precision operative with reliable output in all combat situations. Adaptable to any engagement range.',
            stats: [
                { label: 'SPD',  val: 7, color: '#00ffff' },
                { label: 'HP',   val: 6, color: '#ff4466' },
                { label: 'DMG',  val: 7, color: '#ff8800' },
                { label: 'RATE', val: 7, color: '#ffff00' }
            ],
            perks: ['Single precision shot', 'Standard loadout', '12-round clip · 48 reserve']
        },
        {
            id: 'enforcer', color: 0xaa00ff, hex: '#aa00ff', modelSize: [1.4, 2.5, 1.4],
            name: 'ENFORCER', tag: 'HEAVY SPECIALIST',
            desc: 'Built for sustained engagements. Shotgun burst devastates clustered targets at close range.',
            stats: [
                { label: 'SPD',  val: 4, color: '#00ffff' },
                { label: 'HP',   val: 9, color: '#ff4466' },
                { label: 'DMG',  val: 8, color: '#ff8800' },
                { label: 'RATE', val: 4, color: '#ffff00' }
            ],
            perks: ['3-round shotgun burst per trigger', '160 HP armor plating', '8 shots per clip · 32 reserve']
        },
        {
            id: 'phantom', color: 0xffff00, hex: '#ffff00', modelSize: [0.9, 1.6, 0.9],
            name: 'PHANTOM', tag: 'GHOST OPERATIVE',
            desc: 'Speed is the only armor. Extreme mobility and rapid fire let the Phantom dictate every engagement.',
            stats: [
                { label: 'SPD',  val: 9, color: '#00ffff' },
                { label: 'HP',   val: 4, color: '#ff4466' },
                { label: 'DMG',  val: 4, color: '#ff8800' },
                { label: 'RATE', val: 9, color: '#ffff00' }
            ],
            perks: ['Ultra-fast movement', '85ms fire cooldown', '20-round clip · 72 reserve']
        },
        {
            id: 'medic', color: 0x00ff88, hex: '#00ff88', modelSize: [1.0, 1.8, 1.0],
            name: 'MEDIC', tag: 'SUPPORT OPERATIVE',
            desc: 'Passive regeneration and enhanced field supplies keep the Medic alive far longer than raw stats suggest.',
            stats: [
                { label: 'SPD',  val: 6, color: '#00ffff' },
                { label: 'HP',   val: 7, color: '#ff4466' },
                { label: 'DMG',  val: 5, color: '#ff8800' },
                { label: 'RATE', val: 6, color: '#ffff00' }
            ],
            perks: ['Passive +0.5 HP/sec regeneration', 'HP drops restore 50 instead of 25', '10-round clip · 40 reserve']
        }
    ],
    drops: [
        {
            id: 'hp', color: 0xff3040, hex: '#ff3040', modelShape: 'sphere', modelSize: 0.55,
            name: 'HP PACK', tag: 'INSTANT HEAL',
            desc: 'Restores 25 HP on contact (50 for Medic). Highest priority when your health is critical.',
            stats: [
                { label: 'HEAL',   val: 7,  color: '#ff4466' },
                { label: 'RARITY', val: 6,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 10, color: '#ff8800' }
            ],
            perks: ['Instant +25 HP on pickup', 'Medic operative gets +50 HP', 'Always collect when below 50% HP']
        },
        {
            id: 'ammo', color: 0x00ffff, hex: '#00ffff', modelShape: 'sphere', modelSize: 0.5,
            name: 'AMMO CRATE', tag: 'RESERVE REFILL',
            desc: 'Refills your reserve ammunition. Smart drop guarantees supply when critically low.',
            stats: [
                { label: 'FILL',   val: 9,  color: '#00ffff' },
                { label: 'RARITY', val: 7,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 10, color: '#ff8800' }
            ],
            perks: ['Refills full reserve ammo', 'Smart system guarantees supply', 'Cyan glow — easy to spot']
        },
        {
            id: 'speed', color: 0xff00ff, hex: '#ff00ff', modelShape: 'sphere', modelSize: 0.45,
            name: 'SPEED+', tag: '6s MOVEMENT BOOST',
            desc: 'Dramatically increases movement speed for 6 seconds.',
            stats: [
                { label: 'POWER',  val: 7,  color: '#ff00ff' },
                { label: 'RARITY', val: 5,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 6,  color: '#ff8800' }
            ],
            perks: ['+40% movement speed', '6 second active duration', 'Magenta screen tint while active']
        },
        {
            id: 'shield', color: 0x0088ff, hex: '#0088ff', modelShape: 'sphere', modelSize: 0.55,
            name: 'SHIELD', tag: '4s DAMAGE BLOCK',
            desc: 'Absorbs all incoming damage for 4 seconds. Rarest standard drop.',
            stats: [
                { label: 'POWER',  val: 10, color: '#0088ff' },
                { label: 'RARITY', val: 3,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 4,  color: '#ff8800' }
            ],
            perks: ['Blocks all damage for 4 seconds', 'Rarest drop in the field', 'Blue aura while shield is active']
        },
        {
            id: 'rapid', color: 0xff8800, hex: '#ff8800', modelShape: 'sphere', modelSize: 0.48,
            name: 'RAPID+', tag: '6s FIRE RATE BOOST',
            desc: 'Massively increases your fire rate for 6 seconds.',
            stats: [
                { label: 'POWER',  val: 9,  color: '#ff8800' },
                { label: 'RARITY', val: 5,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 6,  color: '#ff8800' }
            ],
            perks: ['Fire rate multiplied for 6 seconds', 'Stacks with Phantom operative', 'Orange aura while active']
        },
        {
            id: 'overclock', color: 0xffffff, hex: '#ffffff', modelShape: 'sphere', modelSize: 0.48,
            name: 'OVERCLOCK', tag: '5s DAMAGE BOOST',
            desc: 'Doubles your bullet damage for 5 seconds. Melts bosses and armored waves.',
            stats: [
                { label: 'POWER',  val: 10, color: '#ffffff' },
                { label: 'RARITY', val: 3,  color: '#ffff00' },
                { label: 'RANGE',  val: 5,  color: '#00ffff' },
                { label: 'TIMING', val: 5,  color: '#ff8800' }
            ],
            perks: ['Bullet damage ×2 for 5 seconds', 'Devastating against boss waves', 'White glow — rare and powerful']
        },
        {
            id: 'secondary', color: 0xffdd00, hex: '#ffdd00', modelShape: 'sphere', modelSize: 0.5,
            name: 'ROCKET', tag: 'SECONDARY WEAPON',
            desc: 'A 3-shot rocket launcher. Press F to fire. Explodes on impact with massive AOE damage.',
            stats: [
                { label: 'POWER',  val: 10, color: '#ffdd00' },
                { label: 'RARITY', val: 2,  color: '#ffff00' },
                { label: 'RANGE',  val: 7,  color: '#00ffff' },
                { label: 'TIMING', val: 3,  color: '#ff8800' }
            ],
            perks: ['3 rockets per pickup', '100 AOE damage on explosion', 'Press F / dedicated button to fire']
        }
    ],
    threats: [
        {
            id: 'runner', color: 0xff0040, hex: '#ff0040', modelSize: [1.0, 1.8, 1.0],
            name: 'RUNNER', tag: 'MELEE ATTACKER',
            desc: 'Charges directly at targets with no hesitation. High speed, low survivability.',
            stats: [
                { label: 'SPD',  val: 7,  color: '#00ffff' },
                { label: 'HP',   val: 4,  color: '#ff4466' },
                { label: 'DMG',  val: 6,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['High-speed charge', 'Strafe evasion behavior', 'Weak to burst fire']
        },
        {
            id: 'scout', color: 0xffff00, hex: '#ffff00', modelSize: [0.7, 1.2, 0.7],
            name: 'SCOUT', tag: 'SPEED THREAT',
            desc: 'The fastest unit on the field. Eliminate in 1–2 hits before it reaches melee range.',
            stats: [
                { label: 'SPD',  val: 10, color: '#00ffff' },
                { label: 'HP',   val: 1,  color: '#ff4466' },
                { label: 'DMG',  val: 4,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['Extreme movement speed', 'Fragile (40 HP)', 'Melee-only threat']
        },
        {
            id: 'tank', color: 0xaa00ff, hex: '#aa00ff', modelSize: [2.0, 3.6, 2.0],
            name: 'TANK', tag: 'ARMORED UNIT',
            desc: 'Heavily armored behemoth. Absorbs sustained fire and delivers devastating melee damage.',
            stats: [
                { label: 'SPD',  val: 2,  color: '#00ffff' },
                { label: 'HP',   val: 10, color: '#ff4466' },
                { label: 'DMG',  val: 8,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['400 HP total armor', 'Slow movement speed', 'High melee damage output']
        },
        {
            id: 'sniper', color: 0x00ff66, hex: '#00ff66', modelSize: [0.9, 1.6, 0.9],
            name: 'SNIPER', tag: 'RANGED THREAT',
            desc: 'Maintains preferred distance and fires precise projectiles with line-of-sight checks.',
            stats: [
                { label: 'SPD',  val: 2,  color: '#00ffff' },
                { label: 'HP',   val: 4,  color: '#ff4466' },
                { label: 'DMG',  val: 7,  color: '#ff8800' },
                { label: 'RNG',  val: 9,  color: '#aa00ff' }
            ],
            perks: ['60-unit fire range', 'LOS-verified shots', 'Bullets blocked by other enemies']
        },
        {
            id: 'bomber', color: 0xff6600, hex: '#ff6600', modelSize: [1.3, 1.8, 1.3],
            name: 'BOMBER', tag: 'SUICIDE THREAT',
            desc: 'Slow walker that explodes on contact. Eliminate at range — never let it get close.',
            stats: [
                { label: 'SPD',  val: 2,  color: '#00ffff' },
                { label: 'HP',   val: 3,  color: '#ff4466' },
                { label: 'DMG',  val: 9,  color: '#ff8800' },
                { label: 'RNG',  val: 1,  color: '#aa00ff' }
            ],
            perks: ['Explodes on contact for 60 damage', 'Pulses orange warning when close', 'Prioritise before it reaches you']
        },
        {
            id: 'overlord', color: 0xff4400, hex: '#ff4400', modelSize: [4.0, 7.2, 4.0],
            name: 'OVERLORD', tag: 'BOSS UNIT',
            desc: 'Elite command unit deployed every 5 waves. Three phases — each more lethal than the last.',
            stats: [
                { label: 'SPD',  val: 5,  color: '#00ffff' },
                { label: 'HP',   val: 10, color: '#ff4466' },
                { label: 'DMG',  val: 9,  color: '#ff8800' },
                { label: 'RNG',  val: 5,  color: '#aa00ff' }
            ],
            perks: ['Three escalating combat phases', 'Phase 3: full berserk charge', 'Drops guaranteed loot on death']
        }
    ]
};

// ── CODEX preview renderer (Golden Hour Toon) ──
// Operatives, threats and drops are shown with the same toon models the game
// uses (Toon.makeOperative / makeEnemy / makeDrop) on a warm sand pedestal.
// Palette per operative; every threat is coral, like in the game.
const CODEX_HEX = { striker: '#7cc3d6', enforcer: '#c6a2f0', phantom: '#ffc857', medic: '#7fd6a4',
    hp: '#f2545b', ammo: '#e9a93f', speed: '#b98cf0', shield: '#8cc8f5', rapid: '#ff9f4a', overclock: '#ffd25e', secondary: '#d9925f' };
Object.keys(CODEX_DATA).forEach(tab => CODEX_DATA[tab].forEach(item => {
    item.hex = tab === 'threats' ? '#ff5a3c' : (CODEX_HEX[item.id] || '#fff4e2');
    item.color = parseInt(item.hex.slice(1), 16);
}));
const THREAT_KIND = { runner: ['runner', 1.2], scout: ['scout', 0.8], tank: ['tank', 2.2], sniper: ['sniper', 1.0], bomber: ['bomber', 1.3], overlord: ['boss', 2.6] };

let previewRenderer = null, previewScene = null, previewCamera = null;
let previewMesh = null, previewAnimId = null, previewPedestal = null;

function initPreviewRenderer() {
    if (previewRenderer) { sizePreview(); return; }
    const canvas = document.getElementById('preview-canvas');
    previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    previewRenderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    previewRenderer.setClearColor(0x000000, 0);
    previewScene  = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    previewScene.add(new THREE.HemisphereLight(0xfff1d6, 0x8a5a66, 0.75));
    const sunL = new THREE.DirectionalLight(0xffe2bf, 0.9);
    sunL.position.set(4, 7, 6);
    previewScene.add(sunL);
    previewPedestal = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.06, 0.14, 40), Toon.toonMat(0xd8a47f));
    disc.position.y = -0.07;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.14, 0.1, 40), Toon.toonMat(0x3a2733));
    rim.position.y = -0.1;
    previewPedestal.add(rim, disc);
    previewScene.add(previewPedestal);
    sizePreview();
}

function sizePreview() {
    if (!previewRenderer) return;
    const area = document.getElementById('codex-preview-area');
    const w = Math.max(120, area.clientWidth - 8), h = Math.max(120, area.clientHeight - 30);
    previewRenderer.setSize(w, h, false);   // CSS sizes the canvas; this sets the drawing buffer
    previewCamera.aspect = w / h;
    previewCamera.updateProjectionMatrix();
    if (previewMesh) framePreview();
}
window.addEventListener('resize', () => { if (document.getElementById('codex').style.display !== 'none') sizePreview(); });

function clearPreviewMesh() {
    if (!previewMesh) return;
    previewScene.remove(previewMesh);
    previewMesh.traverse(o => {
        if (o.material && !(o.material.userData && o.material.userData.shared)) o.material.dispose();
    });
    previewMesh = null;
}

function framePreview() {
    const box = new THREE.Box3().setFromObject(previewMesh);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.y, size.x * 1.1, 0.8);
    previewPedestal.scale.setScalar(Math.max(0.6, Math.max(size.x, size.z) * 0.75));
    const fit = r / (2 * Math.tan(THREE.MathUtils.degToRad(previewCamera.fov / 2)));
    const dist = fit * 1.35 / Math.min(1, previewCamera.aspect) + 0.6;
    const cy = size.y * 0.5;
    previewCamera.position.set(0, cy + r * 0.28, dist);
    previewCamera.lookAt(0, cy, 0);
}

function setPreviewModel(tab, item) {
    clearPreviewMesh();
    let m;
    if (tab === 'operatives') m = Toon.makeOperative(item.id);
    else if (tab === 'threats') {
        const [kind, sz] = THREAT_KIND[item.id] || ['runner', 1.2];
        m = Toon.makeEnemy(kind, sz);
    } else {
        m = Toon.makeDrop(item.id);
        const dd = m.userData.drop;            // ring sits just under the pickup on the pedestal
        if (dd) { dd.ring.position.y = -0.48; m.children.forEach(c => { if (c !== dd.spin && c !== dd.ring) c.position.y = -0.49; }); }
    }
    const holder = new THREE.Group();
    holder.add(m);
    // sit the model on the pedestal
    const box = new THREE.Box3().setFromObject(m);
    m.position.y -= box.min.y - 0.02;   // tiny lift: feet/ring never share the pedestal's top face (z-fighting)
    previewMesh = holder;
    previewMesh.rotation.y = -0.5;
    previewScene.add(previewMesh);
    framePreview();
}

function animatePreview() {
    previewAnimId = requestAnimationFrame(animatePreview);
    if (previewMesh) {
        previewMesh.rotation.y += 0.01;
        const dm = previewMesh.children[0];
        if (dm && dm.userData.drop) Toon.animateDrop(dm, performance.now());
    }
    if (previewRenderer && previewScene && previewCamera)
        previewRenderer.render(previewScene, previewCamera);
}

// ── CODEX logic ──

function openCodex(tab) {
    document.getElementById('menu').style.display  = 'none';
    const aiB = document.getElementById('ai-btn'); if (aiB) aiB.style.display = 'none';
    document.getElementById('codex').style.display = 'flex';
    initPreviewRenderer();
    if (!previewAnimId) animatePreview();
    switchCodexTab(tab || 'operatives');
}

function closeCodex() {
    cancelAnimationFrame(previewAnimId);
    previewAnimId = null;
    document.getElementById('codex').style.display = 'none';
    document.getElementById('menu').style.display  = 'flex';
}

function switchCodexTab(tab) {
    document.querySelectorAll('.codex-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-btn-' + tab).classList.add('active');
    const sidebar = document.getElementById('codex-sidebar');
    sidebar.innerHTML = '';
    CODEX_DATA[tab].forEach(item => {
        const div = document.createElement('div');
        div.className = 'codex-item';
        div.id = 'codex-item-' + item.id;
        if (tab === 'operatives' && item.id === selectedChar) div.classList.add('selected-operative');
        div.onclick = () => showCodexEntry(tab, item.id);
        div.innerHTML = `
            <div class="item-dot" style="background:${item.hex};"></div>
            <div class="item-labels">
                <span class="item-name">${item.name}</span>
                <span class="item-tag">${item.tag}</span>
            </div>
            ${tab === 'operatives' && item.id === selectedChar
                ? '<span class="item-check">&#10003;</span>' : ''}
        `;
        sidebar.appendChild(div);
    });
    showCodexEntry(tab, CODEX_DATA[tab][0].id);
}

function showCodexEntry(tab, id) {
    const item = CODEX_DATA[tab].find(i => i.id === id);
    if (!item) return;
    document.querySelectorAll('.codex-item').forEach(el => el.classList.remove('active'));
    const sideEl = document.getElementById('codex-item-' + id);
    if (sideEl) sideEl.classList.add('active');
    setPreviewModel(tab, item);
    document.getElementById('preview-label').innerText = item.name;
    const info = document.getElementById('codex-info');
    info.classList.remove('slide-in');
    void info.offsetWidth;
    info.classList.add('slide-in');
    const isOp     = tab === 'operatives';
    const isChosen = isOp && id === selectedChar;
    const selBtn = isOp ? `
            <button class="select-op-btn ${isChosen ? 'already-selected' : ''}"
                    onclick="pickOperative('${id}'); if (typeof Sound !== 'undefined') Sound.uiClick();">
                ${isChosen ? '&#10003; SELECTED' : '&#9658; PLAY AS ' + item.name}
            </button>` : '';
    info.innerHTML = `
        <div class="info-head">
            <div class="info-name"><span class="info-dot" style="background:${item.hex};"></span>${item.name}</div>
            ${selBtn}
        </div>
        <div class="info-tag" style="background:${item.hex};">${item.tag}</div>
        <div class="info-desc">${item.desc}</div>
        <div class="info-stats">
            ${item.stats.map(s => `
                <div class="info-stat-row">
                    <span class="stat-lbl">${s.label}</span>
                    <div class="stat-track">
                        <div class="stat-fill" data-val="${s.val}" style="background:${item.hex};width:0%;"></div>
                    </div>
                    <span class="stat-num">${s.val}</span>
                </div>
            `).join('')}
        </div>
        <div class="info-perks">
            ${item.perks.map(p => `<div class="perk-item">${p}</div>`).join('')}
        </div>
    `;
    setTimeout(() => {
        document.querySelectorAll('.stat-fill').forEach(bar => {
            bar.style.width = (parseInt(bar.dataset.val) * 10) + '%';
        });
    }, 60);
}

function pickOperative(id) {
    selectedChar = id;
    try { localStorage.setItem('msc_operative', id); } catch (e) {}
    document.querySelectorAll('.codex-item').forEach(el => {
        el.classList.remove('selected-operative');
        el.querySelector('.item-check')?.remove();
    });
    const el = document.getElementById('codex-item-' + id);
    if (el) {
        el.classList.add('selected-operative');
        const check = document.createElement('span');
        check.className = 'item-check'; check.textContent = '✓';
        el.appendChild(check);
    }
    showCodexEntry('operatives', id);
    updateMenuSelectedChar();
}

function updateMenuSelectedChar() {
    const data = CODEX_DATA.operatives.find(o => o.id === selectedChar);
    const el   = document.getElementById('menu-selected-char');
    if (data && el) el.innerHTML = `<span class="op-dot" style="background:${data.hex};"></span>${data.name} <small>CHANGE ›</small>`;
}

// ── Difficulty mode ──

function setDifficulty(mode) {
    difficultyMode = mode;
    document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('diff-' + mode);
    if (btn) btn.classList.add('active');
}

// ── Achievement system ──

function unlockAchievement(id) {
    if (aiAssistedRun) return;            // the AI can't unlock things for you
    if (unlockedAchievements.includes(id)) return;
    const def = ACHIEVEMENT_DEFS.find(d => d.id === id);
    if (!def) return;
    unlockedAchievements.push(id);
    localStorage.setItem('msc_achievements', JSON.stringify(unlockedAchievements));
    Sound.achievement();
    showAchievementToast(def.name, def.desc);
}

function showAchievementToast(name, desc) {
    const el = document.getElementById('achievement-toast');
    if (!el) return;
    el.innerHTML = `<span class="ach-label">// ACHIEVEMENT //</span><span class="ach-name">${name}</span><span class="ach-desc">${desc}</span>`;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 3200);
}

function checkAchievements() {
    if (killCount === 1)   unlockAchievement('first_blood');
    if (killCount >= 100)  unlockAchievement('centurion');
    if (totalEnemiesKilled >= 500) unlockAchievement('executioner');
    if (runSpeedPickups >= 3)      unlockAchievement('speed_demon');
    if (comboMultiplier >= 4)      unlockAchievement('combo_master');
}

// ── Kill feed ──

function addKillFeedEntry(text, color) {
    killFeedEntries.push({ text, color, expires: Date.now() + 2500, opacity: 1 });
    if (killFeedEntries.length > (isMobile ? 3 : 5)) killFeedEntries.shift();
}

function renderKillFeed() {
    const el = document.getElementById('kill-feed');
    if (!el) return;
    const now = Date.now();
    killFeedEntries = killFeedEntries.filter(e => now < e.expires);
    el.innerHTML = killFeedEntries.map(e => {
        const age = 1 - (e.expires - now) / 2500;
        const op  = age > 0.75 ? (1 - (age - 0.75) * 4) : 1;
        return `<div class="kf-entry" style="color:${e.color};opacity:${op.toFixed(2)}">${e.text}</div>`;
    }).join('');
}

// ── World helpers ──

function isPositionInBuilding(x, z, radius) {
    for (let b of buildings) {
        if (x + radius > b.minX && x - radius < b.maxX &&
            z + radius > b.minZ && z - radius < b.maxZ) return true;
    }
    return false;
}

function checkCollision(pos, radius) {
    for (let b of buildings) {
        if (pos.x + radius > b.minX && pos.x - radius < b.maxX &&
            pos.z + radius > b.minZ && pos.z - radius < b.maxZ &&
            pos.y < b.maxY) return true;
    }
    return false;
}

// Memory-safe mesh disposal
function disposeMesh(mesh) {
    if (!mesh) return;
    const own = o => o && !(o.userData && o.userData.shared);
    if (own(mesh.geometry)) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => { if (own(m)) m.dispose(); });
        } else if (own(mesh.material)) {
            mesh.material.dispose();
        }
    }
    if (scene) scene.remove(mesh);
}

function createImpact(pos, color, count = 8) {
    // Paper-confetti FX (Toon). Enemy-ish colours burst in the coral accent, the rest as warm dust.
    const enemyCols = [0xff0040, 0xff4400, 0xff6600, 0xffff00, 0x00ff66, 0xaa00ff, 0xff5a3c];
    const kind = color === 0xff0000 ? 'player' : (enemyCols.includes(color) ? 'enemy' : 'dust');
    Toon.burst(pos, kind, Math.ceil(count * 0.8), kind === 'dust' ? 0.5 : 1);
}

// ── Scene init ──

function init() {
    scene = new THREE.Scene();
    camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // WebGL Context Fix: Only initialize renderer if it does not exist
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
    }
    renderer.domElement.style.visibility = '';   // hidden while on the menu (exitToMenu)

    // Golden Hour Toon world: sky, light, shadows, buildings, FX pools, gun viewmodel
    buildingLights = [];
    if (window.Coop && Coop.active) Coop.withSeed(() => Toon.buildWorld()); else Toon.buildWorld();

    player = new THREE.Object3D();
    player.position.set(0, 1.8, 0);
    scene.add(player);

    if (!window._controlsBound) { setupControls(); window._controlsBound = true; }

    const mm = document.getElementById('minimap');
    mm.width = 150; mm.height = 150;
}

// ── Weapons ──

function aimDir(spread) {
    return new THREE.Vector3(
        -Math.sin(yaw + spread) * Math.cos(pitch),
         Math.sin(pitch),
        -Math.cos(yaw + spread) * Math.cos(pitch)
    ).normalize();
}

function shoot() {
    if (!gameRunning || gamePaused) return;
    if ((window.Coop && Coop.active) && !Coop.canAct()) return;
    if (meleeActive) { swingMelee(); return; }
    if (ammo <= 0 && reserve <= 0 && !isReloading) { setMelee(true, true); return; }
    if (ammo <= 0 && reserve > 0 && !isReloading) { reload(); return; }
    if (isReloading || ammo <= 0) return;
    const now = performance.now();
    const cd  = (boosts.rapid && Date.now() < boosts.rapid) ? shootCooldown * 0.4 : shootCooldown;
    if (now - lastShotTime < cd) return;
    ammo--; lastShotTime = now; shakeAmount = Math.max(shakeAmount, burstCount > 1 ? 0.1 : 0.05);
    Juice.onShoot();
    shotsFired++;
    if (ammo === 0 && !isReloading && reserve > 0) setTimeout(reload, 220);

    const hot = boosts.overclock && Date.now() < boosts.overclock;
    const activeDmg = hot ? bulletDmg * 2 : bulletDmg;
    let spreads = burstCount === 3 ? [-0.22, 0, 0.22] : [0];
    if (Juice.extraShots()) spreads = spreads.flatMap(s => [s - 0.025, s + 0.025]);
    // Crosshair accuracy: the bullet's real path is the camera's centre ray (from the
    // eye, exactly through the crosshair). Only the tracer mesh starts at the gun
    // muzzle, and its offset melts into the true path over the first few metres.
    // (Before, the bullet flew from the muzzle PARALLEL to the view ray, so every
    // shot landed ~0.2 right and ~0.12 below where the crosshair pointed.)
    const eye = player.position.clone();
    eye.y += Math.sin(bobTime) * 0.055;
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const muzzleOff = right.multiplyScalar(0.18).add(new THREE.Vector3(0, -0.12, 0));
    for (let s of spreads) {
        const dir = aimDir(s);
        const bullet = Toon.makeBullet(dir, hot);
        const pos = eye.clone();
        bullet.position.copy(pos).add(muzzleOff);
        bullet.lookAt(bullet.position.clone().add(dir));
        bullets.push({ mesh: bullet, pos, off: muzzleOff.clone(), dir, dist: 0, dmg: activeDmg });
        scene.add(bullet);
    }
    if (window.Coop && Coop.active) Coop.onLocalShot(eye, spreads.map(s => aimDir(s)), hot);
}

// ── Melee (bat) ──
// Switch with the bat button / Q. Auto-switches when the gun is completely dry
// and back to the gun as soon as ammo arrives (only if the switch was automatic).
let meleeActive = false, meleeAuto = false, lastMeleeTime = 0;
const MELEE_RANGE = 3.4, MELEE_ARC = Math.cos(THREE.MathUtils.degToRad(55)), MELEE_DMG = 75, MELEE_CD = 430;

function setMelee(on, auto) {
    on = !!on;
    if (on === meleeActive) return;
    meleeActive = on; meleeAuto = on && !!auto;
    if (on) isReloading = false;
    if (typeof Toon !== 'undefined' && Toon.setMelee) Toon.setMelee(on);
    if (typeof AudioEngine !== 'undefined' && AudioEngine.playWeaponSwap) AudioEngine.playWeaponSwap();
    const btn = document.getElementById('melee-btn');
    if (btn) btn.classList.toggle('on', on);
    const fire = document.getElementById('fire-btn');
    if (fire) fire.innerText = on ? 'SWING' : 'FIRE';
    document.body.classList.toggle('melee-mode', on);
    if (typeof updateUI === 'function') updateUI();
}
function toggleMelee() {
    if (!gameRunning || gamePaused) return;
    if (meleeActive && ammo <= 0 && reserve <= 0) { showFloatingFeedback('NO AMMO YET', 'warn'); return; }
    setMelee(!meleeActive, false);
}

function swingMelee() {
    const now = performance.now();
    if (now - lastMeleeTime < MELEE_CD) return;
    lastMeleeTime = now;
    Toon.meleeSwing();
    if (typeof AudioEngine !== 'undefined' && AudioEngine.playSwing) AudioEngine.playSwing();
    shotsFired++;
    // hit test lands at the fast part of the swing
    const gen = runGen;
    setTimeout(() => {
        if (!gameRunning || gen !== runGen) return;
        const fw = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        let hits = 0;
        for (const e of enemies) {
            const to = e.mesh.position.clone().sub(player.position); to.y = 0;
            const reach = MELEE_RANGE + (e.size || 1) * 0.5;
            const d = to.length();
            if (d > reach) continue;
            if (d > 0.6 && to.clone().normalize().dot(fw) < MELEE_ARC) continue;
            const dmg = e.isBoss ? MELEE_DMG * 0.6 : MELEE_DMG;
            e.hp -= dmg; e.hitFlash = 1.0; e._meleeKill = true;
            // knockback: shove straight away from the player, applied over a few frames
            const push = to.lengthSq() > 0.0001 ? to.normalize() : fw.clone();
            e.knock = push.multiplyScalar(e.isBoss ? 0.25 : 0.7);
            hits++; shotsHit++;
            const hp = e.mesh.position.clone(); hp.y += (e.size || 1) * 0.6;
            Toon.burst(hp, 'dust', 10, 0.8);
            if (typeof Juice !== 'undefined' && Juice.dmgNumber) Juice.dmgNumber(hp, Math.round(dmg), false);
        }
        if (hits) {
            triggerHitMarker(hits > 1);
            shakeAmount = Math.max(shakeAmount, 0.18);
            if (typeof AudioEngine !== 'undefined' && AudioEngine.playBonk) AudioEngine.playBonk(); else Sound.enemyHit();
        }
    }, 110);
}

// ── Combat Feedback & Floating Layer ──

function triggerHitMarker(isCrit = false) {
    const hm = document.getElementById('hit-marker');
    if (!hm) return;
    hm.className = 'hit-marker active' + (isCrit ? ' crit' : '');
    clearTimeout(hm._timer);
    hm._timer = setTimeout(() => {
        hm.className = 'hit-marker';
    }, 110);
}

function showFloatingFeedback(text, type = 'score', screenX, screenY) {
    const layer = document.getElementById('feedback-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `floating-pop pop-${type}`;
    el.innerText = text;
    const x = screenX || (window.innerWidth / 2 + (Math.random() - 0.5) * 80);
    const y = screenY || (window.innerHeight / 2 - 40 + (Math.random() - 0.5) * 60);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    layer.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 820);
}

function fireSecondary() {
    if (!gameRunning || !hasSecondaryWeapon || secondaryAmmo <= 0) return;
    if ((window.Coop && Coop.active) && !Coop.canAct()) return;
    secondaryAmmo--;
    if (secondaryAmmo <= 0) hasSecondaryWeapon = false;
    Sound.secondary();
    shakeAmount = 0.35;
    muzzleFlashAmount = 1.5;
    shotsFired++;

    const rocketMesh = Toon.makeRocket();
    rocketMesh.position.copy(player.position);
    Toon.gunFire(2);
    const dir = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
         Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
    ).normalize();
    rocketMesh.lookAt(rocketMesh.position.clone().add(dir));
    rocketMesh.rotateX(Math.PI / 2);
    bullets.push({ mesh: rocketMesh, dir, dist: 0, dmg: 100, isRocket: true, aoeRadius: 6 });
    scene.add(rocketMesh);
}

function rocketExplode(pos) {
    Toon.burst(pos, 'dust', 40, 1.6);
    Toon.ringPop(pos, 4, 0xffc857);
    shakeAmount = 0.5;
    const aoeR = 6;
    let hitCount = 0;
    for (let e of enemies) {
        if (pos.distanceTo(e.mesh.position) < aoeR) {
            e.hp -= 100;
            e.hitFlash = 1.0;
            shotsHit++;
            hitCount++;
        }
    }
    if (hitCount > 0) {
        triggerHitMarker(true);
        if (typeof Sound !== 'undefined' && Sound.enemyHit) Sound.enemyHit();
    }
}

function reload() {
    if (isReloading || reserve <= 0 || ammo === maxClip || meleeActive) return;
    isReloading = true; Sound.reload();
    document.getElementById('wave-status').innerText = 'RELOADING...';
    setTimeout(() => {
        let needed = maxClip - ammo, transfer = Math.min(needed, reserve);
        ammo += transfer; reserve -= transfer;
        isReloading = false;
        if (!isWaveTransition) document.getElementById('wave-status').innerText = 'WAVE ' + wave;
    }, 1000);
}

// ── Powerups ──

function applyPowerup(type) {
    Sound.boost();
    const durations = { speed: 6000, shield: 4000, rapid: 6000, overclock: 5000 };
    boosts[type] = Date.now() + (durations[type] || 5000);
    const el = document.getElementById('boost-' + type);
    if (el) el.style.display = 'inline-block';
    const colors = { speed: '185,140,240', shield: '140,200,245', rapid: '255,159,74', overclock: '255,210,94' };
    const col = colors[type] || '255,255,255';
    const dmgEl = document.getElementById('damage-overlay');
    dmgEl.style.boxShadow = `inset 0 0 120px 60px rgba(${col},0.4)`;
    damageFlashAmount = 0.35;
    setTimeout(() => { dmgEl.style.boxShadow = 'inset 0 0 120px 60px rgba(255,0,40,0.85)'; }, 300);
    if (type === 'speed') {
        runSpeedPickups++;
        checkAchievements();
    }
}

// ── Wave modifier banner ──

function showModifierBanner(modifier) {
    const labels = {
        blitz:   'BLITZ WAVE — ALL SCOUTS',
        siege:   'SIEGE WAVE — SNIPERS ONLY',
        armored: 'ARMORED WAVE — DOUBLE HP',
        swarm:   'SWARM WAVE — DOUBLE COUNT'
    };
    const el = document.getElementById('modifier-banner');
    if (!el) return;
    el.innerText = '// ' + (labels[modifier] || modifier) + ' //';
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 3000);
}

// ── Waves ──

function showWaveBonus(num, bonus) {
    const el = document.getElementById('wave-bonus');
    el.innerText = 'WAVE ' + num + ' CLEARED  +' + bonus;
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 2000);
}

function startWave(num) {
    if (tutorialMode) return;

    // Flawless check for the wave just completed
    if (num > 1 && waveDamageTaken === 0 && !isBossWave) {
        unlockAchievement('flawless');
    }

    if (num > 1) {
        score += (num - 1) * 100;
    }
    const myRun = runGen;

    wave = num;
    waveDamageTaken = 0;
    waveStartHp = hp;
    isBossWave = (num % 5 === 0 && num > 0);
    isWaveTransition = true;

    // Determine wave modifier (not on boss waves)
    if (!isBossWave && num > 1) {
        const roll = Math.random();
        if      (roll < 0.15) currentWaveModifier = 'blitz';
        else if (roll < 0.30) currentWaveModifier = 'siege';
        else if (roll < 0.45) currentWaveModifier = 'armored';
        else if (roll < 0.60) currentWaveModifier = 'swarm';
        else                  currentWaveModifier = null;
        if (currentWaveModifier) showModifierBanner(currentWaveModifier);
    } else {
        currentWaveModifier = null;
    }

    if (isBossWave) {
        const bossBar = document.getElementById('boss-bar-wrapper');
        if (bossBar) bossBar.style.display = 'block';
        document.getElementById('wave-status').innerText = 'BOSS INCOMING';
        Sound.boss();
    } else {
        document.getElementById('wave-status').innerText = 'GET READY';
    }

    let count = isBossWave ? 1 : (5 + num * 2);
    if (currentWaveModifier === 'swarm') count = Math.floor(count * 2);
    if ((window.Coop && Coop.active) && !isBossWave) count = Coop.scaleCount(count);
    enemiesToSpawn = count;
    if ((window.Coop && Coop.active)) Coop.onWaveStart(num);

    setTimeout(() => {
        if (!gameRunning || myRun !== runGen) return;
        isWaveTransition = false;
        Juice.onWaveStart(wave, isBossWave);
        if (!isBossWave) document.getElementById('wave-status').innerText = 'WAVE ' + wave;
        let spawner = setInterval(() => {
            if (myRun !== runGen) { clearInterval(spawner); return; }
            if (gamePaused) return;
            if (enemiesToSpawn > 0 && gameRunning) {
                spawnEnemy(isBossWave);
                enemiesToSpawn--;
            } else {
                clearInterval(spawner);
            }
        }, isBossWave ? 100 : 800);
    }, 1500);
}

function spawnEnemy(isBoss) {
    let ex, ez, attempts = 0;
    const _sa = (window.Coop && Coop.active) ? Coop.spawnAnchor() : player.position;

    if (isBoss) {
        const bossHp = 1500 + (wave - 5) * 200;
        const angle  = Math.random() * Math.PI * 2;
        const dist   = 35;
        ex = _sa.x + Math.cos(angle) * dist;
        ez = _sa.z + Math.sin(angle) * dist;

        const mesh = Toon.makeEnemy('boss', 4.0);
        mesh.position.set(ex, 3.6, ez);
        scene.add(mesh);
        enemies.push({
            mesh, hp: bossHp, maxHp: bossHp, speed: 0.06, size: 4.0,
            behavior: 'boss', isBoss: true, bossPhase: 1,
            strafeDir: 1, nextStrafeChange: Date.now() + 2000,
            shootInterval: 1200, bulletSpeed: 0.8, bulletDamage: 20,
            bulletRange: 80, preferredDist: 25, lastEnemyShot: Date.now() + 2000,
            hitFlash: 0, lastMeleeHit: 0
        });
        if ((window.Coop && Coop.active)) Coop.onSpawn(enemies[enemies.length - 1]);
        return;
    }

    // Base type selection
    let typeRoll = Math.random();
    if (currentWaveModifier === 'blitz') typeRoll = 0.05;
    if (currentWaveModifier === 'siege') typeRoll = 0.20;

    let type;
    if (typeRoll < 0.15) {
        type = { color: 0xffff00, hp: 40,  speed: 0.18, size: 0.8, behavior: 'normal', shootInterval: 0, name: 'SCOUT' };
    } else if (typeRoll < 0.28) {
        type = { color: 0x00ff66, hp: 80,  speed: 0.04, size: 1.0, behavior: 'sniper',
            shootInterval: 1800, bulletSpeed: 0.9, bulletDamage: 15, bulletRange: 60, preferredDist: 30, name: 'SNIPER' };
    } else if (typeRoll > 0.85) {
        type = { color: 0xaa00ff, hp: 400, speed: 0.05, size: 2.2, behavior: 'normal', shootInterval: 0, name: 'TANK' };
    } else if (typeRoll >= 0.62 && typeRoll < 0.74 && wave >= 3) {
        type = { color: 0xff6600, hp: 60,  speed: 0.045, size: 1.3, behavior: 'bomber', shootInterval: 0, name: 'BOMBER' };
    } else {
        type = { color: 0xff0040, hp: 100, speed: 0.08, size: 1.2, behavior: 'normal', shootInterval: 0, name: 'RUNNER' };
    }

    // Difficulty scaling
    const hpScale    = 1 + wave * 0.06;
    const speedScale = 1 + wave * 0.04;
    type.hp    *= hpScale;
    type.speed *= speedScale;
    if (difficultyMode === 'veteran') { type.hp *= 1.4; type.speed *= 1.2; }
    if (currentWaveModifier === 'armored') type.hp *= 2;
    if (currentWaveModifier === 'swarm')   type.hp *= 0.6;

    do {
        const angle = Math.random() * Math.PI * 2;
        const dist  = 30 + Math.random() * 25;
        ex = _sa.x + Math.cos(angle) * dist;
        ez = _sa.z + Math.sin(angle) * dist;
        attempts++;
    } while (isPositionInBuilding(ex, ez, type.size / 2 + 0.5) && attempts < 15);

    let mesh = Toon.makeEnemy(type.name, type.size);
    mesh.position.set(ex, type.size * 0.9, ez);
    scene.add(mesh);
    enemies.push({
        mesh, hp: type.hp, speed: type.speed, size: type.size, behavior: type.behavior,
        name: type.name || 'ENEMY',
        colorHex: '#ff5a3c',
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        nextStrafeChange: Date.now() + 1500,
        shootInterval:  type.shootInterval  || 0,
        bulletSpeed:    type.bulletSpeed    || 0,
        bulletDamage:   type.bulletDamage   || 0,
        bulletRange:    type.bulletRange    || 0,
        preferredDist:  type.preferredDist  || 0,
        lastEnemyShot:  Date.now() + Math.random() * 2000,
        hitFlash: 0, lastMeleeHit: 0
    });
    if ((window.Coop && Coop.active)) Coop.onSpawn(enemies[enemies.length - 1]);
}

// ── Drops ──

function spawnDrop(pos, guaranteed) {
    // Secondary weapon drop (rare, wave 2+)
    if (!guaranteed && !hasSecondaryWeapon && wave >= 2 && Math.random() < 0.04) {
        let dMesh = Toon.makeDrop('secondary');
        dMesh.position.set(pos.x, 0.8, pos.z);
        scene.add(dMesh);
        drops.push({ mesh: dMesh, type: 'secondary' });
        return;
    }

    if (!guaranteed && Math.random() < 0.3) {
        const pTypes  = ['speed', 'shield', 'rapid', 'overclock'];
        const pWeights = [0.38, 0.17, 0.38, 0.07];
        let roll = Math.random(), acc = 0, dType = 'speed';
        for (let i = 0; i < pTypes.length; i++) {
            acc += pWeights[i];
            if (roll < acc) { dType = pTypes[i]; break; }
        }
        let dMesh = Toon.makeDrop(dType);
        dMesh.position.set(pos.x, 0.8, pos.z);
        scene.add(dMesh);
        drops.push({ mesh: dMesh, type: 'powerup', powerup: dType });
        return;
    }

    const ammoOnGround  = drops.filter(d => d.type === 'ammo').length;
    const totalAmmo     = ammo + reserve;
    const desperateAmmo = totalAmmo <= maxClip && ammoOnGround === 0;

    let isH;
    if (guaranteed) {
        isH = hp < playerMaxHp * 0.8;
    } else if (desperateAmmo) {
        isH = false;
    } else if (hp < 50) {
        isH = Math.random() > 0.3;
    } else {
        isH = Math.random() > 0.7;
    }

    let dMesh = Toon.makeDrop(isH ? 'hp' : 'ammo');
    dMesh.position.set(pos.x, 0.8, pos.z);
    scene.add(dMesh);
    drops.push({ mesh: dMesh, type: isH ? 'hp' : 'ammo' });
}

function ammoIsLow() { return ammo + reserve <= maxClip; }
function spawnAmmoDrop(pos) {
    const dMesh = Toon.makeDrop('ammo');
    dMesh.position.set(pos.x, 0.8, pos.z);
    scene.add(dMesh);
    drops.push({ mesh: dMesh, type: 'ammo' });
}

// Passive trickle: while the gun is (nearly) dry, a round trickles into reserve
// every 1.6 s up to one clip, so a run can never get stuck at zero.
let lastTrickle = 0;
function ammoTick() {
    const now = performance.now();
    if (ammo + reserve < maxClip) {
        if (now - lastTrickle > 1600) {
            lastTrickle = now;
            reserve++;
            if (ammo === 0 && !meleeActive && !isReloading) reload();
        }
    } else lastTrickle = now;
    // auto-switch: dry -> bat; ammo back (from a pickup or a full clip of trickle) -> gun
    if (!meleeActive && ammo <= 0 && reserve <= 0 && !isReloading) setMelee(true, true);
    else if (meleeActive && meleeAuto && (ammo > 0 || reserve >= Math.min(maxClip, 6))) {
        setMelee(false);
        if (ammo === 0) reload();
    }
}

// ── Minimap ──

function drawMinimap() {
    const mm  = document.getElementById('minimap');
    const ctx = mm.getContext('2d');
    const W = mm.width, H = mm.height, cx = W / 2, cy = H / 2, scale = 1.5;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, cx, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(58,39,51,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,236,214,0.55)';
    for (let b of buildings) {
        let bx = cx + (b.minX + 2.5 - player.position.x) * scale;
        let by = cy + (b.minZ + 2.5 - player.position.z) * scale;
        let bw = (b.maxX - b.minX) * scale, bh = (b.maxZ - b.minZ) * scale;
        ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    }
    const pCol = { speed: '#b98cf0', shield: '#8cc8f5', rapid: '#ff9f4a', overclock: '#ffd25e' };
    for (let d of drops) {
        let dx = cx + (d.mesh.position.x - player.position.x) * scale;
        let dy = cy + (d.mesh.position.z - player.position.z) * scale;
        ctx.fillStyle = d.type === 'hp' ? '#f2545b' : d.type === 'ammo' ? '#e9a93f'
            : d.type === 'secondary' ? '#d9925f' : (pCol[d.powerup] || '#fff');
        ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ff4a2a';
    for (let eb of enemyBullets) {
        let ex = cx + (eb.mesh.position.x - player.position.x) * scale;
        let ey = cy + (eb.mesh.position.z - player.position.z) * scale;
        ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill();
    }
    for (let e of enemies) {
        let ex = cx + (e.mesh.position.x - player.position.x) * scale;
        let ey = cy + (e.mesh.position.z - player.position.z) * scale;
        ctx.fillStyle = '#ff5a3c';
        ctx.beginPath(); ctx.arc(ex, ey, e.isBoss ? 7 : 4, 0, Math.PI * 2); ctx.fill();
    }
    if ((window.Coop && Coop.active)) Coop.drawMinimap(ctx, cx, cy, scale);
    if (boosts.shield && Date.now() < boosts.shield) {
        ctx.strokeStyle = '#9fd0ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-yaw);
    ctx.fillStyle = '#fff4e2';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,244,226,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, cx - 1, 0, Math.PI * 2); ctx.stroke();
}

// ── HUD ──

const _uiCache = {};
function setText(id, v) {
    if (_uiCache[id] === v) return;
    _uiCache[id] = v;
    const el = document.getElementById(id);
    if (el) el.innerText = v;
}
function updateUI() {
    const hpVal = Math.max(0, Math.ceil(hp));
    const hpEl = document.getElementById('hp-val');
    if (hpEl) setText('hp-val', hpVal);

    // Vitality bar & low-health warning
    const hpFill = document.getElementById('hp-fill');
    if (hpFill) {
        const pct = Math.max(0, Math.min(100, (hp / playerMaxHp) * 100));
        hpFill.style.width = pct + '%';
        hpFill.classList.toggle('low', pct < 30);
    }
    const opEl = document.getElementById('hud-op-name');
    if (opEl && selectedChar) {
        setText('hud-op-name', selectedChar.toUpperCase());
    }

    setText('ammo-val', ammo);
    setText('reserve-val', reserve);
    setText('score-val', score.toLocaleString());
    setText('enemies-left', enemies.length + enemiesToSpawn);
    const rm = document.getElementById('reload-msg');
    const dry = ammo <= 0 && reserve <= 0;
    if (rm) {
        if (rm._txt === undefined) rm._txt = rm.innerHTML;
        const want = dry ? 'NO AMMO · BAT OUT' : rm._txt;
        if (rm._shown !== want) { rm.innerHTML = want; rm._shown = want; }
        rm.style.display = (dry || (ammo <= 3 && reserve > 0 && !meleeActive)) ? 'block' : 'none';
    }

    // Combo display
    const comboEl = document.getElementById('combo-display');
    if (comboEl) {
        if (comboMultiplier > 1) {
            comboEl.style.display = 'inline';
            document.getElementById('combo-val').innerText = comboMultiplier;
        } else {
            comboEl.style.display = 'none';
        }
    }

    // Secondary weapon HUD
    const secEl = document.getElementById('secondary-hud');
    if (secEl) {
        secEl.style.display = hasSecondaryWeapon ? 'block' : 'none';
        const secAmmoEl = document.getElementById('secondary-ammo-val');
        if (secAmmoEl) secAmmoEl.innerText = secondaryAmmo;
    }

    // Damage overlay
    const dmgEl = document.getElementById('damage-overlay');
    dmgEl.style.opacity = damageFlashAmount;
    if (damageFlashAmount > 0) damageFlashAmount = Math.max(0, damageFlashAmount - 0.04);

    // Muzzle flash
    const mfEl = document.getElementById('muzzle-flash');
    mfEl.style.opacity = muzzleFlashAmount;
    if (muzzleFlashAmount > 0) muzzleFlashAmount = Math.max(0, muzzleFlashAmount - 0.18);

    // Chromatic aberration
    if (chromaAmount > 0) chromaAmount = Math.max(0, chromaAmount - 0.07);

    // Boost tags
    const now = Date.now();
    ['speed', 'shield', 'rapid', 'overclock'].forEach(b => {
        const el = document.getElementById('boost-' + b);
        if (el) el.style.display = (boosts[b] && now < boosts[b]) ? 'inline-block' : 'none';
    });

    // Boss health bar
    const bossBarWrapper = document.getElementById('boss-bar-wrapper');
    if (bossBarWrapper) {
        const boss = enemies.find(e => e.isBoss);
        if (boss && isBossWave) {
            bossBarWrapper.style.display = 'block';
            const pct = Math.max(0, boss.hp / boss.maxHp * 100);
            const fill = document.getElementById('boss-bar-fill');
            if (fill) fill.style.width = pct + '%';
            const phaseEl = document.getElementById('boss-phase-label');
            if (phaseEl) phaseEl.innerText = 'PHASE ' + (boss.bossPhase === 1 ? 'I' : boss.bossPhase === 2 ? 'II' : 'III');
        } else if (!isBossWave) {
            bossBarWrapper.style.display = 'none';
        }
    }

    // Kill feed
    renderKillFeed();
}

// ── Game loop ──

let _animating = false;

function animate() {
    if (!gameRunning) { _animating = false; return; }
    if (gamePaused) { _animating = false; return; }
    if (hp <= 0 && !(window.Coop && Coop.active)) {
        _animating = false;
        triggerGameOver();
        return;
    }
    if (_animating) return; // prevent double loop
    _animating = true;
    requestAnimationFrame(() => { _animating = false; animate(); });

    const shielded = boosts.shield && Date.now() < boosts.shield;
    const sp       = (boosts.speed  && Date.now() < boosts.speed)  ? playerSpeed * 1.8 : playerSpeed;

    let pSize = 0.7;
    let fw = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    let rt = new THREE.Vector3( Math.cos(yaw), 0, -Math.sin(yaw));
    let mX = 0, mZ = 0;
    if (!isMobile) {
        if (keys['w']) { mX += fw.x * sp; mZ += fw.z * sp; }
        if (keys['s']) { mX -= fw.x * sp; mZ -= fw.z * sp; }
        if (keys['a']) { mX -= rt.x * sp; mZ -= rt.z * sp; }
        if (keys['d']) { mX += rt.x * sp; mZ += rt.z * sp; }
    } else if (joystick.active) {
        mX = (fw.x * -joystick.y + rt.x * joystick.x) * sp;
        mZ = (fw.z * -joystick.y + rt.z * joystick.x) * sp;
    }
    if ((window.Coop && Coop.active)) { Coop.preFrame(); if (Coop.downed) { mX = 0; mZ = 0; } }
    player.position.x += mX; if (checkCollision(player.position, pSize)) player.position.x -= mX;
    player.position.z += mZ; if (checkCollision(player.position, pSize)) player.position.z -= mZ;

    // View bob
    const isMoving = mX !== 0 || mZ !== 0;
    if (isMoving) bobTime += 0.1;
    camera.position.copy(player.position);
    camera.position.y += Math.sin(bobTime) * 0.055;

    if (shakeAmount > 0) {
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount;
        shakeAmount *= 0.88;
    }
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // MEDIC passive regeneration
    if (selectedChar === 'medic' && hp < playerMaxHp) {
        hp = Math.min(playerMaxHp, hp + 0.008);
    }

    // Dynamic building lights pulse
    const nowMs = Date.now();
    buildingLights.forEach(light => {
        light.intensity = light.userData.baseIntensity *
            (0.7 + Math.sin(nowMs * 0.0008 + light.userData.phase) * 0.45);
    });

    // Player bullets (swept: checked every 0.25 units so fast bullets can't tunnel
    // through an enemy between frames; logical path = the crosshair ray)
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        if (!b.pos) b.pos = b.mesh.position.clone();
        let speed = b.isRocket ? 1.5 : 2.0;
        const STEPS = 8, stepLen = speed / STEPS;
        let done = false, nextPos = b.pos.clone();
        for (let st = 0; st < STEPS && !done; st++) {
            nextPos.addScaledVector(b.dir, stepLen);
            const travelled = b.dist + stepLen * (st + 1);
            if (b.isRocket && (checkCollision(nextPos, 0.3) || nextPos.y <= 0.25 || travelled > 60)) {
                rocketExplode(nextPos); done = true; break;
            }
            if (!b.isRocket && (checkCollision(nextPos, 0.2) || nextPos.y <= 0.02 || travelled > 150)) {
                if (travelled <= 150) createImpact(nextPos, 0xd9b796, 6);
                done = true; break;
            }
            for (let e of enemies) {
                let r = e.size / 2 + 0.4;
                const topY = e.mesh.position.y + e.size * 0.9 + 0.35;
                if (nextPos.x > e.mesh.position.x - r && nextPos.x < e.mesh.position.x + r &&
                    nextPos.z > e.mesh.position.z - r && nextPos.z < e.mesh.position.z + r &&
                    nextPos.y < topY) {
                    const base = b.dmg || bulletDmg;
                    e.hp -= b.isRocket ? base : Juice.onHit(e, nextPos, b.dir, base);
                    e.hitFlash = 1.0; e._meleeKill = false;
                    shotsHit++;
                    if (b.isRocket) rocketExplode(nextPos);
                    done = true; break;
                }
            }
        }
        if (done) { disposeMesh(b.mesh); bullets.splice(i, 1); continue; }
        b.pos.copy(nextPos); b.dist += speed;
        const fade = b.off ? Math.max(0, 1 - b.dist / 7) : 0;
        b.mesh.position.copy(b.pos);
        if (fade > 0) b.mesh.position.addScaledVector(b.off, fade);
    }

    // Enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let eb = enemyBullets[i];
        let nextPos = eb.mesh.position.clone().add(eb.dir.clone().multiplyScalar(eb.speed));
        if (checkCollision(nextPos, 0.15) || eb.dist > eb.range) {
            if (eb.dist <= eb.range) createImpact(nextPos, 0xd9b796, 4);
            disposeMesh(eb.mesh); enemyBullets.splice(i, 1); continue;
        }
        let blocked = false;
        const sub = eb.dir.clone().multiplyScalar(eb.speed / 3);
        let probe2 = eb.mesh.position.clone();
        outer: for (let s = 0; s < 3; s++) {
            probe2.add(sub);
            for (let e of enemies) {
                let r = e.size / 2 + 0.4;
                if (probe2.x > e.mesh.position.x - r && probe2.x < e.mesh.position.x + r &&
                    probe2.z > e.mesh.position.z - r && probe2.z < e.mesh.position.z + r) {
                    createImpact(probe2, 0xd9b796, 4); blocked = true; break outer;
                }
            }
        }
        if (blocked) { disposeMesh(eb.mesh); enemyBullets.splice(i, 1); continue; }
        if (nextPos.distanceTo(player.position) < 1.0) {
            if (!shielded) {
                const dmg = eb.damage;
                if (difficultyMode === 'ghost') {
                    hp = 0;
                } else {
                    hp -= dmg;
                    waveDamageTaken += dmg;
                }
                damageFlashAmount = 0.7; shakeAmount = 0.18; chromaAmount = 1.0;
                Juice.onPlayerHit();
            } else {
                createImpact(player.position.clone().add(new THREE.Vector3(-Math.sin(yaw) * 1.2, -0.3, -Math.cos(yaw) * 1.2)), 0x9fd0ff, 8);
            }
            disposeMesh(eb.mesh); enemyBullets.splice(i, 1); continue;
        }
        eb.mesh.position.copy(nextPos); eb.dist += eb.speed;
    }

    // Particles
    particles.forEach(p => {
        if (!p.active) return;
        p.mesh.position.add(p.velocity);
        p.velocity.y -= 0.01; p.life -= 0.03;
        let s = p.life * 1.5;
        p.mesh.scale.set(s, s, s);
        p.mesh.material.opacity = p.life;
        if (p.life <= 0) { p.active = false; p.mesh.visible = false; }
    });

    // Enemy AI (co-op clients only mirror the host's enemies: Coop.clientTick)
    const _coopHost = (window.Coop && Coop.active) && Coop.isHost();
    if ((window.Coop && Coop.active) && Coop.isClient()) Coop.clientTick();
    else for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];
        // co-op host: each enemy chases the nearest standing player
        const _tg = _coopHost ? Coop.target(e) : null;
        const _tp = _tg ? _tg.pos : player.position;

        // Hit flash
        if (e.hitFlash > 0) {
            e.mesh.material.emissiveIntensity = 0.8 + e.hitFlash * 2.5;
            e.hitFlash = Math.max(0, e.hitFlash - 0.1);
        } else {
            e.mesh.material.emissiveIntensity = 0.8;
        }

        // Melee knockback (decays over a few frames, blocked by buildings)
        if (e.knock && e.hp > 0) {
            const k = e.knock;
            e.mesh.position.x += k.x; if (checkCollision(e.mesh.position, (e.size || 1) * 0.4)) e.mesh.position.x -= k.x;
            e.mesh.position.z += k.z; if (checkCollision(e.mesh.position, (e.size || 1) * 0.4)) e.mesh.position.z -= k.z;
            k.multiplyScalar(0.72);
            if (k.lengthSq() < 0.0004) e.knock = null;
        }

        if (e.hp <= 0) {
            // Scoring, combo, streak callouts, confetti, kill pop — see js/juice.js
            const _mine = !(window.Coop && Coop.active) || Coop.killedByMe(e);
            const actualPts = _mine ? Juice.onKill(e) : Coop.otherKill(e);

            // Kill tracking
            if (_mine) killCount++;
            if (_mine && !aiAssistedRun) {
                totalEnemiesKilled++;
                localStorage.setItem('msc_total_kills', totalEnemiesKilled);
            }

            checkAchievements();

            // Kill feed
            const feedName = (_mine ? '' : Coop.killerName(e) + ' › ') + (e.isBoss ? 'OVERLORD' : (e.name || 'ENEMY'));
            addKillFeedEntry(`${e._meleeKill ? '🏏 ' : e._headKill ? '◎ ' : ''}${feedName}${_mine ? ' <b>+' + actualPts + '</b>' + (comboMultiplier > 1 ? ' <i>x' + comboMultiplier + '</i>' : '') : ''}`, '#fff4e2');

            // Drops
            if (e.isBoss) {
                if (_mine) unlockAchievement('boss_slayer');
                spawnDrop(e.mesh.position, true);
                spawnDrop(e.mesh.position, true);
                spawnDrop(e.mesh.position, false);
                isBossWave = false;
                const bossBarWrapper = document.getElementById('boss-bar-wrapper');
                if (bossBarWrapper) bossBarWrapper.style.display = 'none';
                // (BOSS DOWN is shown by the single callout card; no second banner)
            } else if (ammoIsLow() && !drops.some(d => d.type === 'ammo')) {
                // Never soft-lock: when low on ammo the next kill ALWAYS drops ammo
                spawnAmmoDrop(e.mesh.position);
            } else if (Math.random() < Juice.dropChance()) {
                spawnDrop(e.mesh.position);
            } else if (Math.random() < 0.18) {
                spawnAmmoDrop(e.mesh.position);   // extra ammo-only roll: pickups are more frequent
            }

            if (_coopHost) Coop.enemyGone(e, 'kill');
            disposeMesh(e.mesh); enemies.splice(i, 1); continue;
        }

        let distToPlayer = e.mesh.position.distanceTo(_tp);

        // Teleport if out of range
        if (distToPlayer > 80 && !e.isBoss) {
            let a = Math.random() * Math.PI * 2;
            e.mesh.position.x = _tp.x + Math.cos(a) * 30;
            e.mesh.position.z = _tp.z + Math.sin(a) * 30;
            createImpact(e.mesh.position, 0xaa00ff, 15); continue;
        }

        let toP = _tp.clone().sub(e.mesh.position).normalize();

        // BOMBER behavior
        if (e.behavior === 'bomber') {
            if (distToPlayer < 2.5) {
                Sound.bomberBoom();
                if (_tg && _tg.remote) Coop.hurtRemote(_tg, 60);
                else if (!shielded) {
                    if (difficultyMode === 'ghost') {
                        hp = 0;
                    } else {
                        hp -= 60;
                        waveDamageTaken += 60;
                    }
                    damageFlashAmount = 1.0; shakeAmount = 0.5; chromaAmount = 1.0;
                }
                createImpact(e.mesh.position, 0xff6600, 35);
                if (_coopHost) Coop.enemyGone(e, 'boom');
                disposeMesh(e.mesh); enemies.splice(i, 1); continue;
            }
            if (distToPlayer < 10) {
                e.mesh.material.emissiveIntensity = 0.8 + Math.sin(nowMs * 0.015) * 0.7;
            }
            let moveX = toP.x * e.speed, moveZ = toP.z * e.speed;
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.z -= moveZ;
            e.mesh.lookAt(_tp.x, e.mesh.position.y, _tp.z);
            continue;
        }

        // BOSS behavior
        if (e.behavior === 'boss') {
            const hpPct = e.hp / e.maxHp;
            if      (hpPct > 0.65) e.bossPhase = 1;
            else if (hpPct > 0.30) e.bossPhase = 2;
            else                   e.bossPhase = 3;

            const bossSpeed = e.bossPhase === 3 ? 0.22 : (e.bossPhase === 2 ? 0.12 : 0.06);
            const shootRate = e.bossPhase === 1 ? 1800 : (e.bossPhase === 2 ? 800 : 500);

            let moveX = toP.x * bossSpeed, moveZ = toP.z * bossSpeed;
            if (e.bossPhase < 3 && distToPlayer < 30) {
                let sV = new THREE.Vector3(-toP.z, 0, toP.x);
                moveX += sV.x * e.strafeDir * bossSpeed * 0.5;
                moveZ += sV.z * e.strafeDir * bossSpeed * 0.5;
                if (Date.now() > e.nextStrafeChange) {
                    e.strafeDir *= -1;
                    e.nextStrafeChange = Date.now() + 1200 + Math.random() * 800;
                }
            }
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.z -= moveZ;
            e.mesh.lookAt(_tp.x, e.mesh.position.y, _tp.z);

            // Melee (500ms cooldown to avoid per-frame damage)
            if (distToPlayer < 3.0 && ((_tg && _tg.remote) || !shielded)) {
                if (!e.lastMeleeHit || Date.now() - e.lastMeleeHit > 500) {
                    e.lastMeleeHit = Date.now();
                    const meleeDmg = 15;
                    if (_tg && _tg.remote) Coop.hurtRemote(_tg, meleeDmg);
                    else if (difficultyMode === 'ghost') hp = 0;
                    else { hp -= meleeDmg; waveDamageTaken += meleeDmg; }
                    if (!(_tg && _tg.remote)) { shakeAmount = 0.2; chromaAmount = 0.8; Sound.hit(); }
                }
            }

            // Ranged burst
            if (distToPlayer <= 60 && Date.now() - e.lastEnemyShot > shootRate) {
                e.lastEnemyShot = Date.now();
                const burstSpreads = e.bossPhase === 1 ? [0] : e.bossPhase === 2 ? [-0.2, 0, 0.2] : [-0.3, -0.15, 0, 0.15, 0.3];
                for (let sp of burstSpreads) {
                    const eBullet = Toon.makeEnemyBullet(true);
                    eBullet.position.copy(e.mesh.position);
                    eBullet.position.y = e.mesh.position.y + 1.5; // eye-level (boss center is at 3.6)
                    const eDir = _tp.clone().sub(eBullet.position).normalize();
                    const rotDir = new THREE.Vector3(
                        eDir.x * Math.cos(sp) - eDir.z * Math.sin(sp),
                        eDir.y,
                        eDir.x * Math.sin(sp) + eDir.z * Math.cos(sp)
                    ).normalize();
                    enemyBullets.push({ mesh: eBullet, dir: rotDir, dist: 0, speed: 0.85, damage: 20, range: 80 });
                    scene.add(eBullet);
                    if (_coopHost) Coop.ebSpawn(enemyBullets[enemyBullets.length - 1], true);
                }
            }
            continue;
        }

        // SNIPER behavior
        if (e.behavior === 'sniper') {
            let moveDir = distToPlayer < e.preferredDist - 3 ? toP.clone().negate()
                        : distToPlayer > e.preferredDist + 3 ? toP.clone()
                        : new THREE.Vector3(-toP.z, 0, toP.x);
            let moveX = moveDir.x * e.speed, moveZ = moveDir.z * e.speed;
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.z -= moveZ;
            e.mesh.lookAt(_tp.x, e.mesh.position.y, _tp.z);

            let losBlocked = false;
            if (distToPlayer <= e.bulletRange && Date.now() - e.lastEnemyShot > e.shootInterval) {
                let steps = Math.ceil(distToPlayer / 1.5);
                let losStep = _tp.clone().sub(e.mesh.position).divideScalar(steps);
                let probe   = e.mesh.position.clone();
                for (let s = 1; s < steps; s++) {
                    probe.add(losStep);
                    for (let other of enemies) {
                        if (other === e) continue;
                        let r = other.size / 2 + 0.3;
                        if (probe.x > other.mesh.position.x - r && probe.x < other.mesh.position.x + r &&
                            probe.z > other.mesh.position.z - r && probe.z < other.mesh.position.z + r) {
                            losBlocked = true; break;
                        }
                    }
                    if (losBlocked) break;
                }
            }
            if (distToPlayer <= e.bulletRange && Date.now() - e.lastEnemyShot > e.shootInterval && !losBlocked) {
                e.lastEnemyShot = Date.now();
                let eBullet = Toon.makeEnemyBullet(false);
                eBullet.position.copy(e.mesh.position);
                eBullet.position.y = e.mesh.position.y + e.size * 0.4;
                let eDir = _tp.clone().sub(eBullet.position).normalize();
                eBullet.position.addScaledVector(eDir, e.size / 2 + 0.8);
                enemyBullets.push({ mesh: eBullet, dir: eDir, dist: 0, speed: e.bulletSpeed, damage: e.bulletDamage, range: e.bulletRange });
                scene.add(eBullet);
                if (_coopHost) Coop.ebSpawn(enemyBullets[enemyBullets.length - 1], false);
            }
            continue;
        }

        // Normal AI (runner, scout, tank)
        let sV = new THREE.Vector3(-toP.z, 0, toP.x);
        let moveX = (toP.x * e.speed) + (sV.x * e.strafeDir * e.speed * 0.4);
        let moveZ = (toP.z * e.speed) + (sV.z * e.strafeDir * e.speed * 0.4);
        e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.x -= moveX;
        e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.z -= moveZ;
        if (Date.now() > e.nextStrafeChange) {
            e.strafeDir *= -1;
            e.nextStrafeChange = Date.now() + 1000 + Math.random() * 1000;
        }
        e.mesh.lookAt(_tp.x, e.mesh.position.y, _tp.z);
        if (distToPlayer < 1.8 && ((_tg && _tg.remote) || !shielded)) {
            if (!e.lastMeleeHit || Date.now() - e.lastMeleeHit > 400) {
                e.lastMeleeHit = Date.now();
                const meleeDmg = 10;
                if (_tg && _tg.remote) Coop.hurtRemote(_tg, meleeDmg);
                else if (difficultyMode === 'ghost') {
                    hp = 0;
                } else {
                    hp -= meleeDmg;
                    waveDamageTaken += meleeDmg;
                }
                if (!(_tg && _tg.remote)) shakeAmount = 0.08;
                createImpact(_tp, 0xffffff, 2);
            }
        }
    }

    if (enemies.length === 0 && enemiesToSpawn === 0 && !isWaveTransition && !((window.Coop && Coop.active) && Coop.isClient())) Juice.onWaveCleared();

    ammoTick();

    // Drops
    for (let i = drops.length - 1; i >= 0; i--) {
        let d = drops[i];
        Toon.animateDrop(d.mesh, nowMs);
        const dd = player.position.distanceTo(d.mesh.position);
        if (dd < Juice.pickupRadius() * 2.5 && dd > 1.0) {      // gentle pull towards the player
            d.mesh.position.x += (player.position.x - d.mesh.position.x) * 0.04;
            d.mesh.position.z += (player.position.z - d.mesh.position.z) * 0.04;
        }
        if (dd < Juice.pickupRadius()) {
            Sound.pickup();
            const healAmt = selectedChar === 'medic' ? 50 : 25;
            if      (d.type === 'hp')        hp = Math.min(playerMaxHp, hp + healAmt);
            else if (d.type === 'ammo')      { const c = CHARS[selectedChar]; reserve = Math.min(MAX_RESERVE, Math.max(reserve + Math.ceil((c ? c.reserve : 48) / 2), c ? c.reserve : MAX_RESERVE)); if (ammo === 0 && !meleeActive) setTimeout(reload, 50); }
            else if (d.type === 'powerup')   applyPowerup(d.powerup);
            else if (d.type === 'secondary') { hasSecondaryWeapon = true; secondaryAmmo = 3; }
            createImpact(d.mesh.position, d.mesh.material.color.getHex(), 15);
            if ((window.Coop && Coop.active)) Coop.onLocalPickup(d);
            disposeMesh(d.mesh); drops.splice(i, 1);
        }
    }

    if ((window.Coop && Coop.active)) Coop.postFrame();
    Juice.update();
    updateUI();
    drawMinimap();
    renderer.render(scene, camera);
}

// ── Game Over ──

function triggerGameOver() {
    gameRunning = false;

    // AI-played runs ("AI plays for me" / "AI practice") earn nothing: no XP,
    // levels, unlocks or high score. Only the player's own runs count.
    const aiRun = aiAssistedRun;
    // High score
    const prevBest = highScore;
    const isBest = !aiRun && score > highScore;
    if (isBest) {
        highScore = score;
        localStorage.setItem('msc_highscore', highScore);
    }

    // XP calculation (same formula as before, plus a streak bonus)
    const xpEarned = aiRun ? 0 : Math.max(0, Math.floor(score / 8) + killCount * 2 + (wave - 1) * 40 + (Juice.run.bestStreak || 0) * 5);
    const oldXP    = playerXP;
    const oldRank  = getPlayerRank(playerXP);
    playerXP      += xpEarned;
    localStorage.setItem('msc_xp', playerXP);
    const newRank  = getPlayerRank(playerXP);
    if (newRank.name !== oldRank.name) Sound.rankUp();

    const survSecs = Math.floor((Date.now() - runStartTime) / 1000);
    const timeStr = `${Math.floor(survSecs / 60)}:${(survSecs % 60).toString().padStart(2, '0')}`;
    const acc = shotsFired > 0 ? Math.round(shotsHit / shotsFired * 100) : 0;

    Juice.showGameOver({
        score, best: highScore, prevBest, isBest, wave, kills: killCount, acc, time: timeStr,
        xp: xpEarned, oldXP, newXP: playerXP, rank: newRank.name, aiRun
    });
    updateMenuRankDisplay();
}

// ── Start / Begin ──

function startGame() {
    checkDevice();
    if (isMobile) {
        requestFullscreen();
        if (!isLandscape()) { updateOrientationOverlay(); return; }
    }
    startGameCore();
}

// The run setup itself (co-op starts runs through here too: a joining phone that
// is still in portrait gets the rotate overlay and the run resumes on rotation).
function startGameCore() {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const c = CHARS[selectedChar];
    playerSpeed = c.speed; playerMaxHp = c.maxHp; shootCooldown = c.cooldown;
    bulletDmg = c.dmg; maxClip = c.clip; ammo = c.clip; burstCount = c.burst;
    if (typeof setMelee === 'function') setMelee(false); meleeAuto = false; lastTrickle = performance.now();
    hp = c.maxHp; reserve = c.reserve; boosts = {};

    // Reset run stats
    killCount = 0; shotsFired = 0; shotsHit = 0;
    runSpeedPickups = 0; waveDamageTaken = 0;
    comboCount = 0; comboMultiplier = 1;
    hasSecondaryWeapon = false; secondaryAmmo = 0;
    killFeedEntries = [];
    runStartTime = Date.now();

    document.getElementById('menu').style.display = 'none';
    Juice.onRunStart();
    beginGame();
}

function beginGame() {
    document.getElementById('ui').style.display         = 'block';
    document.getElementById('crosshair').style.display  = 'block';
    document.getElementById('minimap').style.display    = 'block';
    document.getElementById('boosts-hud').style.display = 'flex';
    if (!isMobile) document.body.requestPointerLock();
    else {
        requestFullscreen();
        document.getElementById('mobile-controls').style.display = 'block';
    }
    init();
    if ((window.Coop && Coop.active)) Coop.onRunInit();
    gameRunning = true;
    if (tutorialMode) {
        document.getElementById('wave-status').innerText = 'TRAINING';
        initTutorialPhases();
    } else if (!((window.Coop && Coop.active) && Coop.isClient())) {
        startWave(1);   // co-op clients get their waves from the host
    }
    animate();
}

// ── Menu rank display ──

function updateMenuRankDisplay() {
    const rank = getPlayerRank();
    const next = getNextRank();
    const rankEl = document.getElementById('menu-rank-val');
    const xpEl   = document.getElementById('menu-xp-val');
    if (rankEl) rankEl.innerText = rank.name;
    if (xpEl)   xpEl.innerText  = playerXP + ' XP';
    // progress bar
    const prog = document.getElementById('menu-rank-prog');
    if (prog && next) {
        const pct = Math.min(100, (playerXP - rank.xp) / (next.xp - rank.xp) * 100);
        prog.style.width = pct.toFixed(1) + '%';
    }
}

// ── Settings ──

function openSettings() {
    const el = document.getElementById('settings');
    el.style.display = 'flex';
    updateSettingsUI();
    if (isMobile || ('ontouchstart' in window)) {
        document.getElementById('gyro-row').style.display      = 'flex';
        document.getElementById('gyro-sens-row').style.display = settings.gyroEnabled ? 'flex' : 'none';
    }
}

function closeSettings() {
    document.getElementById('settings').style.display = 'none';
}

function updateSettingsUI() {
    const volSlider = document.getElementById('vol-slider');
    if (volSlider) {
        volSlider.value = settings.masterVolume;
        document.getElementById('vol-val').innerText = settings.masterVolume;
    }
    const gyroToggle = document.getElementById('gyro-toggle');
    if (gyroToggle) {
        gyroToggle.innerText = settings.gyroEnabled ? 'ON' : 'OFF';
        gyroToggle.classList.toggle('on', settings.gyroEnabled);
    }
    const gyroSensSlider = document.getElementById('gyro-sens-slider');
    if (gyroSensSlider) {
        gyroSensSlider.value = settings.gyroSensitivity;
        document.getElementById('gyro-sens-val').innerText = settings.gyroSensitivity;
        document.getElementById('gyro-sens-row').style.display = settings.gyroEnabled ? 'flex' : 'none';
    }
    const lookSlider = document.getElementById('look-sens-slider');
    if (lookSlider) {
        lookSlider.value = settings.lookSensitivity;
        document.getElementById('look-sens-val').innerText = settings.lookSensitivity;
    }
    const aiTrainToggle = document.getElementById('ai-train-visibility-toggle');
    if (aiTrainToggle) {
        const visible = !!settings.aiFeatures;
        aiTrainToggle.innerText = visible ? 'ON' : 'OFF';
        aiTrainToggle.classList.toggle('on', visible);
    }
}

function toggleAITrainButtonSetting() {
    settings.aiFeatures = !settings.aiFeatures;
    saveSettings();
    updateSettingsUI();
    if (typeof window.setNexusTrainButtonVisible === 'function') {
        window.setNexusTrainButtonVisible(settings.aiFeatures);
    }
}

function toggleGyroSetting() {
    if (settings.gyroEnabled) {
        disableGyro();
    } else {
        enableGyro();
    }
    document.getElementById('gyro-sens-row').style.display = settings.gyroEnabled ? 'flex' : 'none';
}

// ── Pause ──

function togglePause() {
    if (!gameRunning) return;
    if ((window.Coop && Coop.active)) { Coop.toggleMenu(); return; }   // co-op never freezes the shared run
    gamePaused = !gamePaused;
    if (gamePaused) {
        document.exitPointerLock();
        Juice.onPause(true);
        document.getElementById('pause-menu').style.display = 'flex';
    } else {
        resumeGame();
    }
}

function resumeGame() {
    gamePaused = false;
    Juice.onPause(false);
    document.getElementById('pause-menu').style.display = 'none';
    if (!isMobile) document.body.requestPointerLock();
    // Only restart the loop if it was fully stopped (not just paused)
    animate();
}

// Back to the menu WITHOUT reloading the page: a reload throws the phone out of
// fullscreen (browsers only allow re-entering on a fresh tap), which is why the
// game kept dropping out of fullscreen after ABORT / MENU.
function exitToMenu() {
    if ((window.Coop && Coop.active)) Coop.leave();
    if (!aiAssistedRun && score > highScore) { highScore = score; localStorage.setItem('msc_highscore', highScore); }
    if (typeof NEXUS !== 'undefined') { if (NEXUS.isTraining) NEXUS.stopTraining(); if (NEXUS.on) NEXUS.disable(); }
    gameRunning = false; gamePaused = false; tutorialMode = false;
    if (typeof Juice !== 'undefined') { Juice.onPause(true); Juice.run.firing = false; }
    if (document.pointerLockElement) document.exitPointerLock();
    enemies.forEach(e => disposeMesh(e.mesh)); bullets.forEach(b => disposeMesh(b.mesh));
    enemyBullets.forEach(b => disposeMesh(b.mesh)); drops.forEach(d => disposeMesh(d.mesh));
    enemies.length = 0; bullets.length = 0; enemyBullets.length = 0; drops.length = 0;
    buildings.length = 0; particles.length = 0; killFeedEntries.length = 0;
    score = 0; wave = 0; enemiesToSpawn = 0; isWaveTransition = false;
    isBossWave = false; currentWaveModifier = null; isReloading = false; lastShotTime = 0;
    shakeAmount = 0; damageFlashAmount = 0; chromaAmount = 0; yaw = 0; pitch = 0;
    ['ui', 'crosshair', 'boosts-hud', 'mobile-controls', 'pause-menu', 'gameover', 'boss-bar-wrapper']
        .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    const mm = document.getElementById('minimap'); if (mm) mm.style.display = 'none';
    const go = document.getElementById('gameover'); if (go) go.classList.remove('show');
    const pm = document.getElementById('perk-modal'); if (pm) pm.classList.remove('show');
    if (typeof hideTutHint === 'function') hideTutHint();
    document.body.classList.remove('in-run');
    if (renderer) renderer.domElement.style.visibility = 'hidden';
    document.getElementById('menu').style.display = 'flex';
    const hsEl = document.getElementById('menu-hs'); if (hsEl) hsEl.innerText = highScore.toLocaleString();
    updateMenuRankDisplay();
    if (typeof Juice !== 'undefined' && Juice.renderMenuProgress) Juice.renderMenuProgress();
    if (typeof Fullscreen !== 'undefined') Fullscreen.ensure();
}

document.addEventListener('pointerlockchange', () => {
    if ((window.Coop && Coop.active)) { if (!document.pointerLockElement && gameRunning && !Juice.picking) Coop.showMenu(); return; }
    if (!document.pointerLockElement && gameRunning && !gamePaused && !Juice.picking) {
        gamePaused = true;
        Juice.onPause(true);
        document.getElementById('pause-menu').style.display = 'flex';
    }
});

// ── Resize ──

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('menu-hs').innerText = highScore.toLocaleString();
updateMenuSelectedChar();

// Init rank display on menu
updateMenuRankDisplay();

// Auto-show tutorial on very first visit
if (!localStorage.getItem('msc_tut_done')) {
    openTutorial();
}
