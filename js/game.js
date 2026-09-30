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

// ── CODEX preview renderer ──
let previewRenderer = null, previewScene = null, previewCamera = null;
let previewMesh = null, previewLight = null, previewAnimId = null;

function initPreviewRenderer() {
    if (previewRenderer) return;
    const canvas = document.getElementById('preview-canvas');
    previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    previewRenderer.setSize(220, 220);
    previewRenderer.setClearColor(0x000000, 0);
    previewScene  = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.2));
    previewLight = new THREE.PointLight(0x00ffff, 4, 40);
    previewLight.position.set(3, 6, 4);
    previewScene.add(previewLight);
    const fill = new THREE.PointLight(0xffffff, 1.2, 40);
    fill.position.set(-4, 1, -3);
    previewScene.add(fill);
    const grid = new THREE.GridHelper(10, 10, 0x111111, 0x0a0a0a);
    previewScene.add(grid);
}

function clearPreviewMesh() {
    if (previewMesh) {
        previewScene.remove(previewMesh);
        previewMesh.geometry.dispose();
        previewMesh.material.dispose();
        previewMesh = null;
    }
}

function setPreviewMesh(color, w, h, d) {
    clearPreviewMesh();
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.35,
        roughness: 0.55, metalness: 0.5
    });
    previewMesh = new THREE.Mesh(geo, mat);
    previewMesh.position.y = h / 2;
    previewMesh.userData.baseY = h / 2;
    const edges = new THREE.EdgesGeometry(geo);
    const line  = new THREE.LineSegments(edges,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
    );
    previewMesh.add(line);
    previewScene.add(previewMesh);
    if (previewLight) previewLight.color.setHex(color);
    const dist = Math.max(h, w) * 2.4 + 1.5;
    previewCamera.position.set(0, h * 0.55, dist);
    previewCamera.lookAt(0, h * 0.3, 0);
}

function setPreviewSphere(color, radius) {
    clearPreviewMesh();
    const geo = new THREE.OctahedronGeometry(radius);
    const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.6,
        roughness: 0.25, metalness: 0.7
    });
    previewMesh = new THREE.Mesh(geo, mat);
    previewMesh.position.y = radius + 0.4;
    previewMesh.userData.baseY = radius + 0.4;
    const edges = new THREE.EdgesGeometry(geo);
    const line  = new THREE.LineSegments(edges,
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })
    );
    previewMesh.add(line);
    previewScene.add(previewMesh);
    if (previewLight) previewLight.color.setHex(color);
    previewCamera.position.set(0, radius * 2.5, radius * 6);
    previewCamera.lookAt(0, radius + 0.4, 0);
}

function animatePreview() {
    previewAnimId = requestAnimationFrame(animatePreview);
    if (previewMesh) {
        previewMesh.rotation.y += 0.012;
        previewMesh.position.y = (previewMesh.userData.baseY || 0)
            + Math.sin(Date.now() * 0.0016) * 0.06;
    }
    if (previewRenderer && previewScene && previewCamera)
        previewRenderer.render(previewScene, previewCamera);
}

// ── CODEX logic ──

function openCodex(tab) {
    document.getElementById('menu').style.display  = 'none';
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
            <div class="item-dot" style="background:${item.hex};box-shadow:0 0 7px ${item.hex};"></div>
            <div class="item-labels">
                <span class="item-name" style="color:${item.hex};">${item.name}</span>
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
    if (item.modelShape === 'sphere') {
        setPreviewSphere(item.color, item.modelSize);
    } else {
        setPreviewMesh(item.color, item.modelSize[0], item.modelSize[1], item.modelSize[2]);
    }
    document.getElementById('preview-label').innerText = '// ' + item.name + ' //';
    const info = document.getElementById('codex-info');
    info.classList.remove('slide-in');
    void info.offsetWidth;
    info.classList.add('slide-in');
    const isOp     = tab === 'operatives';
    const isChosen = isOp && id === selectedChar;
    info.innerHTML = `
        <div class="info-name" style="color:${item.hex};text-shadow:0 0 24px ${item.hex}55;">
            ${item.name}
        </div>
        <div class="info-tag" style="color:${item.hex};border-color:${item.hex};">${item.tag}</div>
        <div class="info-desc">${item.desc}</div>
        <div class="info-stats">
            ${item.stats.map(s => `
                <div class="info-stat-row">
                    <span class="stat-lbl">${s.label}</span>
                    <div class="stat-track">
                        <div class="stat-fill" data-val="${s.val}" style="background:${s.color};box-shadow:0 0 6px ${s.color};width:0%;"></div>
                    </div>
                    <span class="stat-num">${s.val}</span>
                </div>
            `).join('')}
        </div>
        <div class="info-perks">
            ${item.perks.map(p => `<div class="perk-item">&rsaquo; ${p}</div>`).join('')}
        </div>
        ${isOp ? `
            <button class="select-op-btn ${isChosen ? 'already-selected' : ''}"
                    onclick="pickOperative('${id}')">
                ${isChosen ? '&#10003; OPERATIVE SELECTED' : '&#9658; SELECT THIS OPERATIVE'}
            </button>
        ` : ''}
    `;
    setTimeout(() => {
        document.querySelectorAll('.stat-fill').forEach(bar => {
            bar.style.width = (parseInt(bar.dataset.val) * 10) + '%';
        });
    }, 60);
}

function pickOperative(id) {
    selectedChar = id;
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
    if (data && el) el.innerHTML = `<span style="color:${data.hex};">&#9658; ${data.name}</span>`;
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
    if (killFeedEntries.length > 6) killFeedEntries.shift();
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
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
        } else {
            mesh.material.dispose();
        }
    }
    if (scene) scene.remove(mesh);
}

function createImpact(pos, color, count = 8) {
    for (let i = 0; i < count; i++) {
        let p = particles.find(p => !p.active);
        if (!p) break;
        p.active = true; p.mesh.visible = true; p.life = 1.0;
        p.mesh.position.copy(pos);
        p.mesh.material.color.setHex(color);
        p.velocity.set(
            (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.2) * 0.4,
            (Math.random() - 0.5) * 0.4
        );
    }
}

// ── Scene init ──

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000005);
    scene.fog = new THREE.FogExp2(0x000011, 0.04);

    camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // WebGL Context Fix: Only initialize renderer if it does not exist
    if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(renderer.domElement);
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    let sun = new THREE.DirectionalLight(0x00ffff, 0.5);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    let road = new THREE.Mesh(
        new THREE.PlaneGeometry(500, 500),
        new THREE.MeshStandardMaterial({ color: 0x080808 })
    );
    road.rotation.x = -Math.PI / 2;
    scene.add(road);

    buildingLights = [];
    for (let i = 0; i < 40; i++) {
        let bh = Math.random() * 20 + 10;
        let mesh = new THREE.Mesh(
            new THREE.BoxGeometry(5, bh, 5),
            new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0x111111 : 0x1a1a1a })
        );
        let bx = Math.random() * 200 - 100, bz = Math.random() * 200 - 100;
        if (Math.abs(bx) < 15 && Math.abs(bz) < 15) bx += 25;
        mesh.position.set(bx, bh / 2, bz);
        scene.add(mesh);
        buildings.push({ minX: bx - 2.5, maxX: bx + 2.5, minY: 0, maxY: bh, minZ: bz - 2.5, maxZ: bz + 2.5 });
        if (Math.random() > 0.3) {
            let win = new THREE.PointLight(Math.random() > 0.5 ? 0xff0040 : 0x00ffff, 1, 15);
            win.position.set(bx, bh * 0.8, bz);
            win.userData.baseIntensity = 0.6 + Math.random() * 0.8;
            win.userData.phase = Math.random() * Math.PI * 2;
            scene.add(win);
            buildingLights.push(win);
        }
    }

    const pGeo = new THREE.SphereGeometry(PARTICLE_SIZE, 4, 4);
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const pMesh = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
        pMesh.visible = false;
        scene.add(pMesh);
        particles.push({ mesh: pMesh, velocity: new THREE.Vector3(), active: false, life: 0 });
    }

    player = new THREE.Object3D();
    player.position.set(0, 1.8, 0);
    scene.add(player);

    setupControls();

    const mm = document.getElementById('minimap');
    mm.width = 150; mm.height = 150;
}

// ── Weapons ──

function shoot() {
    if (!gameRunning || isReloading || ammo <= 0) return;
    const now = performance.now();
    const cd  = (boosts.rapid && Date.now() < boosts.rapid) ? shootCooldown * 0.4 : shootCooldown;
    if (now - lastShotTime < cd) return;
    ammo--; lastShotTime = now; Sound.shoot(); shakeAmount = 0.12;
    muzzleFlashAmount = 1.0;
    shotsFired++;
    if (ammo === 0 && !isReloading && reserve > 0) setTimeout(reload, 220);

    const activeDmg = (boosts.overclock && Date.now() < boosts.overclock) ? bulletDmg * 2 : bulletDmg;
    const spreads = burstCount === 3 ? [-0.22, 0, 0.22] : [0];
    for (let s of spreads) {
        let bullet = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: (boosts.overclock && Date.now() < boosts.overclock) ? 0xffffff : 0x00ffff })
        );
        bullet.position.copy(player.position);
        let dir = new THREE.Vector3(
            -Math.sin(yaw + s) * Math.cos(pitch),
             Math.sin(pitch),
            -Math.cos(yaw + s) * Math.cos(pitch)
        ).normalize();
        bullets.push({ mesh: bullet, dir, dist: 0, dmg: activeDmg });
        scene.add(bullet);
    }
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
    secondaryAmmo--;
    if (secondaryAmmo <= 0) hasSecondaryWeapon = false;
    Sound.secondary();
    shakeAmount = 0.35;
    muzzleFlashAmount = 1.5;
    shotsFired++;

    const rocketMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffdd00 })
    );
    rocketMesh.position.copy(player.position);
    const dir = new THREE.Vector3(
        -Math.sin(yaw) * Math.cos(pitch),
         Math.sin(pitch),
        -Math.cos(yaw) * Math.cos(pitch)
    ).normalize();
    bullets.push({ mesh: rocketMesh, dir, dist: 0, dmg: 100, isRocket: true, aoeRadius: 6 });
    scene.add(rocketMesh);
}

function rocketExplode(pos) {
    createImpact(pos, 0xff4400, 40);
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
    if (isReloading || reserve <= 0 || ammo === maxClip) return;
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
    const colors = { speed: '255,0,255', shield: '0,136,255', rapid: '255,136,0', overclock: '255,255,255' };
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
        showWaveBonus(num - 1, (num - 1) * 100);
        Sound.wave();
    }

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
        document.getElementById('wave-status').innerText = '// BOSS INCOMING //';
        Sound.boss();
    } else {
        document.getElementById('wave-status').innerText = 'SIGNAL STABILIZING...';
    }

    let count = isBossWave ? 1 : (5 + num * 2);
    if (currentWaveModifier === 'swarm') count = Math.floor(count * 2);
    enemiesToSpawn = count;

    setTimeout(() => {
        if (!gameRunning) return;
        isWaveTransition = false;
        if (!isBossWave) document.getElementById('wave-status').innerText = 'WAVE ' + wave;
        let spawner = setInterval(() => {
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

    if (isBoss) {
        const bossHp = 1500 + (wave - 5) * 200;
        const angle  = Math.random() * Math.PI * 2;
        const dist   = 35;
        ex = player.position.x + Math.cos(angle) * dist;
        ez = player.position.z + Math.sin(angle) * dist;

        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(4, 7.2, 4),
            new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.0 })
        );
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
        ex = player.position.x + Math.cos(angle) * dist;
        ez = player.position.z + Math.sin(angle) * dist;
        attempts++;
    } while (isPositionInBuilding(ex, ez, type.size / 2 + 0.5) && attempts < 15);

    let mesh = new THREE.Mesh(
        new THREE.BoxGeometry(type.size, type.size * 1.8, type.size),
        new THREE.MeshStandardMaterial({ color: type.color, emissive: type.color, emissiveIntensity: 0.8 })
    );
    mesh.position.set(ex, type.size * 0.9, ez);
    scene.add(mesh);
    enemies.push({
        mesh, hp: type.hp, speed: type.speed, size: type.size, behavior: type.behavior,
        name: type.name || 'ENEMY',
        colorHex: '#' + type.color.toString(16).padStart(6, '0'),
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
}

// ── Drops ──

function spawnDrop(pos, guaranteed) {
    // Secondary weapon drop (rare, wave 2+)
    if (!guaranteed && !hasSecondaryWeapon && wave >= 2 && Math.random() < 0.04) {
        const col = 0xffdd00;
        let dMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.8, 0.3, 1.4),
            new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2 })
        );
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
        const pColors = { speed: 0xff00ff, shield: 0x0088ff, rapid: 0xff8800, overclock: 0xffffff };
        const col = pColors[dType];
        let dMesh = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.7),
            new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 })
        );
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

    let col   = isH ? 0xff0000 : 0x00ffff;
    let dMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 })
    );
    dMesh.position.set(pos.x, 0.8, pos.z);
    scene.add(dMesh);
    drops.push({ mesh: dMesh, type: isH ? 'hp' : 'ammo' });
}

// ── Minimap ──

function drawMinimap() {
    const mm  = document.getElementById('minimap');
    const ctx = mm.getContext('2d');
    const W = mm.width, H = mm.height, cx = W / 2, cy = H / 2, scale = 1.5;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, cx, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a2a3a';
    for (let b of buildings) {
        let bx = cx + (b.minX + 2.5 - player.position.x) * scale;
        let by = cy + (b.minZ + 2.5 - player.position.z) * scale;
        let bw = (b.maxX - b.minX) * scale, bh = (b.maxZ - b.minZ) * scale;
        ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    }
    const pCol = { speed: '#ff00ff', shield: '#0088ff', rapid: '#ff8800', overclock: '#ffffff' };
    for (let d of drops) {
        let dx = cx + (d.mesh.position.x - player.position.x) * scale;
        let dy = cy + (d.mesh.position.z - player.position.z) * scale;
        ctx.fillStyle = d.type === 'hp' ? '#ff4444' : d.type === 'ammo' ? '#00ffff'
            : d.type === 'secondary' ? '#ffdd00' : (pCol[d.powerup] || '#fff');
        ctx.beginPath(); ctx.arc(dx, dy, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ff8800';
    for (let eb of enemyBullets) {
        let ex = cx + (eb.mesh.position.x - player.position.x) * scale;
        let ey = cy + (eb.mesh.position.z - player.position.z) * scale;
        ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill();
    }
    for (let e of enemies) {
        let ex = cx + (e.mesh.position.x - player.position.x) * scale;
        let ey = cy + (e.mesh.position.z - player.position.z) * scale;
        ctx.fillStyle = e.isBoss ? '#ff4400' : ('#' + e.mesh.material.color.getHexString());
        ctx.beginPath(); ctx.arc(ex, ey, e.isBoss ? 7 : 4, 0, Math.PI * 2); ctx.fill();
    }
    if (boosts.shield && Date.now() < boosts.shield) {
        ctx.strokeStyle = '#0088ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-yaw);
    ctx.fillStyle = '#00ffff';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(-4, 5); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, cx - 1, 0, Math.PI * 2); ctx.stroke();
}

// ── HUD ──

function updateUI() {
    const hpVal = Math.max(0, Math.ceil(hp));
    const hpEl = document.getElementById('hp-val');
    if (hpEl) hpEl.innerText = hpVal;

    // Vitality bar & low-health warning
    const hpFill = document.getElementById('hp-fill');
    if (hpFill) {
        const pct = Math.max(0, Math.min(100, (hp / playerMaxHp) * 100));
        hpFill.style.width = pct + '%';
        if (pct < 30) {
            hpFill.style.background = 'linear-gradient(90deg, #ff0040, #ff4400)';
            hpFill.style.boxShadow = '0 0 14px rgba(255, 0, 64, 0.7)';
        } else {
            hpFill.style.background = 'linear-gradient(90deg, #00ff66, #00f0ff)';
            hpFill.style.boxShadow = '0 0 10px rgba(0, 255, 102, 0.4)';
        }
    }
    const opEl = document.getElementById('hud-op-name');
    if (opEl && selectedChar) {
        opEl.innerText = selectedChar.toUpperCase();
    }

    document.getElementById('ammo-val').innerText    = ammo;
    document.getElementById('reserve-val').innerText = reserve;
    document.getElementById('score-val').innerText   = score;
    document.getElementById('enemies-left').innerText = enemies.length + enemiesToSpawn;
    document.getElementById('reload-msg').style.display = (ammo <= 3 && reserve > 0) ? 'block' : 'none';

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
    if (chromaAmount > 0) {
        renderer.domElement.style.filter = `hue-rotate(${(chromaAmount * 40).toFixed(1)}deg) saturate(${(1 + chromaAmount).toFixed(2)})`;
        chromaAmount = Math.max(0, chromaAmount - 0.07);
    } else {
        renderer.domElement.style.filter = '';
    }

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
    if (hp <= 0) {
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

    // Player bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        let speed = b.isRocket ? 1.5 : 2.0;
        let nextPos = b.mesh.position.clone().add(b.dir.clone().multiplyScalar(speed));

        // Rocket hits building or ground
        if (b.isRocket && (checkCollision(nextPos, 0.3) || nextPos.y <= 0.25 || b.dist > 60)) {
            rocketExplode(nextPos);
            disposeMesh(b.mesh); bullets.splice(i, 1); continue;
        }

        if (!b.isRocket && (checkCollision(nextPos, 0.2) || b.dist > 150)) {
            if (b.dist <= 150) createImpact(nextPos, 0x00ffff, 6);
            disposeMesh(b.mesh); bullets.splice(i, 1); continue;
        }

        let hitEnemy = false;
        for (let e of enemies) {
            let r = e.size / 2 + 0.4;
            if (nextPos.x > e.mesh.position.x - r && nextPos.x < e.mesh.position.x + r &&
                nextPos.z > e.mesh.position.z - r && nextPos.z < e.mesh.position.z + r) {
                e.hp -= b.dmg || bulletDmg;
                e.hitFlash = 1.0;
                hitEnemy = true;
                shotsHit++;
                triggerHitMarker(false);
                if (typeof Sound !== 'undefined' && Sound.enemyHit) Sound.enemyHit();
                if (!b.isRocket) createImpact(nextPos, 0xff0040, 12);
                break;
            }
        }
        if (hitEnemy && !b.isRocket) { disposeMesh(b.mesh); bullets.splice(i, 1); continue; }
        if (hitEnemy && b.isRocket)  { rocketExplode(nextPos); disposeMesh(b.mesh); bullets.splice(i, 1); continue; }
        b.mesh.position.copy(nextPos); b.dist += speed;
    }

    // Enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        let eb = enemyBullets[i];
        let nextPos = eb.mesh.position.clone().add(eb.dir.clone().multiplyScalar(eb.speed));
        if (checkCollision(nextPos, 0.15) || eb.dist > eb.range) {
            if (eb.dist <= eb.range) createImpact(nextPos, 0x00ff66, 4);
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
                    createImpact(probe2, 0x00ff66, 4); blocked = true; break outer;
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
                Sound.hit(); createImpact(player.position, 0xff0000, 6);
            } else {
                createImpact(player.position, 0x0088ff, 8);
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

    // Enemy AI
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i];

        // Hit flash
        if (e.hitFlash > 0) {
            e.mesh.material.emissiveIntensity = 0.8 + e.hitFlash * 2.5;
            e.hitFlash = Math.max(0, e.hitFlash - 0.1);
        } else {
            e.mesh.material.emissiveIntensity = 0.8;
        }

        if (e.hp <= 0) {
            Sound.explode();

            // Scoring with combo
            const pts = e.isBoss ? 500 * wave : 50;
            const actualPts = pts * comboMultiplier;
            score += actualPts;

            // Kill tracking
            killCount++;
            totalEnemiesKilled++;
            localStorage.setItem('msc_total_kills', totalEnemiesKilled);

            // Floating score popup
            showFloatingFeedback(`+${actualPts}`, 'score');

            // Combo system
            if (comboDecayTimer) clearTimeout(comboDecayTimer);
            comboCount++;
            if (comboCount >= 7)      comboMultiplier = 4;
            else if (comboCount >= 4) comboMultiplier = 3;
            else if (comboCount >= 2) comboMultiplier = 2;
            else                      comboMultiplier = 1;

            if (comboMultiplier > 1) {
                showFloatingFeedback(`COMBO ×${comboMultiplier}!`, 'clean');
            }

            comboDecayTimer = setTimeout(() => {
                comboCount = 0; comboMultiplier = 1;
            }, 2200);

            if (typeof Sound !== 'undefined' && Sound.kill) Sound.kill(comboMultiplier);

            checkAchievements();

            // Kill feed
            const feedName = e.isBoss ? 'OVERLORD' : (e.name || 'ENEMY');
            const feedCol  = e.isBoss ? '#ff4400' : (e.colorHex || '#ffffff');
            addKillFeedEntry(`+${actualPts} ${feedName}${comboMultiplier > 1 ? ' ×' + comboMultiplier : ''}`, feedCol);

            createImpact(e.mesh.position, e.mesh.material.color.getHex(), e.isBoss ? 50 : 20);

            // Drops
            if (e.isBoss) {
                unlockAchievement('boss_slayer');
                spawnDrop(e.mesh.position, true);
                spawnDrop(e.mesh.position, true);
                spawnDrop(e.mesh.position, false);
                isBossWave = false;
                const bossBarWrapper = document.getElementById('boss-bar-wrapper');
                if (bossBarWrapper) bossBarWrapper.style.display = 'none';
                const banner = document.getElementById('wave-bonus');
                banner.innerText = '// OVERLORD ELIMINATED //';
                banner.style.opacity = '1';
                setTimeout(() => { banner.style.opacity = '0'; }, 3000);
            } else if (Math.random() > 0.5) {
                spawnDrop(e.mesh.position);
            }

            disposeMesh(e.mesh); enemies.splice(i, 1); continue;
        }

        let distToPlayer = e.mesh.position.distanceTo(player.position);

        // Teleport if out of range
        if (distToPlayer > 80 && !e.isBoss) {
            let a = Math.random() * Math.PI * 2;
            e.mesh.position.x = player.position.x + Math.cos(a) * 30;
            e.mesh.position.z = player.position.z + Math.sin(a) * 30;
            createImpact(e.mesh.position, 0xaa00ff, 15); continue;
        }

        let toP = player.position.clone().sub(e.mesh.position).normalize();

        // BOMBER behavior
        if (e.behavior === 'bomber') {
            if (distToPlayer < 2.5) {
                Sound.bomberBoom();
                if (!shielded) {
                    if (difficultyMode === 'ghost') {
                        hp = 0;
                    } else {
                        hp -= 60;
                        waveDamageTaken += 60;
                    }
                    damageFlashAmount = 1.0; shakeAmount = 0.5; chromaAmount = 1.0;
                }
                createImpact(e.mesh.position, 0xff6600, 35);
                disposeMesh(e.mesh); enemies.splice(i, 1); continue;
            }
            if (distToPlayer < 10) {
                e.mesh.material.emissiveIntensity = 0.8 + Math.sin(nowMs * 0.015) * 0.7;
            }
            let moveX = toP.x * e.speed, moveZ = toP.z * e.speed;
            e.mesh.position.x += moveX; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.x -= moveX;
            e.mesh.position.z += moveZ; if (checkCollision(e.mesh.position, e.size/2)) e.mesh.position.z -= moveZ;
            e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);
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
            e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);

            // Melee (500ms cooldown to avoid per-frame damage)
            if (distToPlayer < 3.0 && !shielded) {
                if (!e.lastMeleeHit || Date.now() - e.lastMeleeHit > 500) {
                    e.lastMeleeHit = Date.now();
                    const meleeDmg = 15;
                    if (difficultyMode === 'ghost') hp = 0;
                    else { hp -= meleeDmg; waveDamageTaken += meleeDmg; }
                    shakeAmount = 0.2; chromaAmount = 0.8; Sound.hit();
                }
            }

            // Ranged burst
            if (distToPlayer <= 60 && Date.now() - e.lastEnemyShot > shootRate) {
                e.lastEnemyShot = Date.now();
                const burstSpreads = e.bossPhase === 1 ? [0] : e.bossPhase === 2 ? [-0.2, 0, 0.2] : [-0.3, -0.15, 0, 0.15, 0.3];
                for (let sp of burstSpreads) {
                    const eBullet = new THREE.Mesh(
                        new THREE.SphereGeometry(0.18, 6, 6),
                        new THREE.MeshBasicMaterial({ color: 0xff4400 })
                    );
                    eBullet.position.copy(e.mesh.position);
                    eBullet.position.y = e.mesh.position.y + 1.5; // eye-level (boss center is at 3.6)
                    const eDir = player.position.clone().sub(eBullet.position).normalize();
                    const rotDir = new THREE.Vector3(
                        eDir.x * Math.cos(sp) - eDir.z * Math.sin(sp),
                        eDir.y,
                        eDir.x * Math.sin(sp) + eDir.z * Math.cos(sp)
                    ).normalize();
                    enemyBullets.push({ mesh: eBullet, dir: rotDir, dist: 0, speed: 0.85, damage: 20, range: 80 });
                    scene.add(eBullet);
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
            e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);

            let losBlocked = false;
            if (distToPlayer <= e.bulletRange && Date.now() - e.lastEnemyShot > e.shootInterval) {
                let steps = Math.ceil(distToPlayer / 1.5);
                let losStep = player.position.clone().sub(e.mesh.position).divideScalar(steps);
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
                let eBullet = new THREE.Mesh(
                    new THREE.SphereGeometry(0.12, 6, 6),
                    new THREE.MeshBasicMaterial({ color: 0x00ff66 })
                );
                eBullet.position.copy(e.mesh.position);
                eBullet.position.y = e.mesh.position.y + e.size * 0.4;
                let eDir = player.position.clone().sub(eBullet.position).normalize();
                eBullet.position.addScaledVector(eDir, e.size / 2 + 0.8);
                enemyBullets.push({ mesh: eBullet, dir: eDir, dist: 0, speed: e.bulletSpeed, damage: e.bulletDamage, range: e.bulletRange });
                scene.add(eBullet);
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
        e.mesh.lookAt(player.position.x, e.mesh.position.y, player.position.z);
        if (distToPlayer < 1.8 && !shielded) {
            if (!e.lastMeleeHit || Date.now() - e.lastMeleeHit > 400) {
                e.lastMeleeHit = Date.now();
                const meleeDmg = 10;
                if (difficultyMode === 'ghost') {
                    hp = 0;
                } else {
                    hp -= meleeDmg;
                    waveDamageTaken += meleeDmg;
                }
                shakeAmount = 0.08; createImpact(player.position, 0xffffff, 2);
            }
        }
    }

    if (enemies.length === 0 && enemiesToSpawn === 0 && !isWaveTransition) startWave(wave + 1);

    // Drops
    for (let i = drops.length - 1; i >= 0; i--) {
        let d = drops[i];
        d.mesh.rotation.y += 0.08;
        d.mesh.position.y = 0.8 + Math.sin(nowMs * 0.005) * 0.2;
        if (player.position.distanceTo(d.mesh.position) < 2.0) {
            Sound.pickup();
            const healAmt = selectedChar === 'medic' ? 50 : 25;
            if      (d.type === 'hp')        hp = Math.min(playerMaxHp, hp + healAmt);
            else if (d.type === 'ammo')      { const c = CHARS[selectedChar]; reserve = Math.min(MAX_RESERVE, c ? c.reserve : MAX_RESERVE); }
            else if (d.type === 'powerup')   applyPowerup(d.powerup);
            else if (d.type === 'secondary') { hasSecondaryWeapon = true; secondaryAmmo = 3; }
            createImpact(d.mesh.position, d.mesh.material.color.getHex(), 15);
            disposeMesh(d.mesh); drops.splice(i, 1);
        }
    }

    updateUI();
    drawMinimap();
    renderer.render(scene, camera);
}

// ── Game Over ──

function triggerGameOver() {
    gameRunning = false;

    // High score
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('msc_highscore', highScore);
    }

    // XP calculation
    const xpEarned = Math.floor(score / 8) + killCount * 2 + (wave - 1) * 40;
    const oldRank  = getPlayerRank(playerXP);
    playerXP      += xpEarned;
    localStorage.setItem('msc_xp', playerXP);
    const newRank  = getPlayerRank(playerXP);
    const rankedUp = newRank.name !== oldRank.name;

    // Survival time
    const survSecs = Math.floor((Date.now() - runStartTime) / 1000);
    const mins = Math.floor(survSecs / 60), secs = survSecs % 60;
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    // Accuracy
    const acc = shotsFired > 0 ? Math.round(shotsHit / shotsFired * 100) : 0;

    // Rank progress
    const nextR = getNextRank(playerXP);
    const rankBar = nextR
        ? `<div class="stat-bar-row"><span>${newRank.name}</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.min(100,(playerXP-newRank.xp)/(nextR.xp-newRank.xp)*100).toFixed(1)}%"></div></div><span>${nextR.name}</span></div>`
        : `<div style="color:#ffff00;font-size:11px;letter-spacing:2px">MAX RANK ACHIEVED</div>`;

    const rankUpBadge = rankedUp
        ? `<div id="rank-up-badge">&#9650; RANK UP: ${newRank.name}</div>`
        : '';

    document.getElementById('gameover').style.display = 'flex';
    document.getElementById('gameover').innerHTML = `
        <div class="scanlines-overlay"></div>
        <div id="go-inner">
            <h1 style="color:#ff3040;letter-spacing:4px;text-shadow:0 0 30px #ff0040;">SIGNAL TERMINATED</h1>
            ${rankUpBadge}
            <div class="go-stats-grid">
                <div class="go-stat"><span class="go-stat-label">SCORE</span><span class="go-stat-val" style="color:#fff">${score}</span></div>
                <div class="go-stat"><span class="go-stat-label">BEST</span><span class="go-stat-val" style="color:#ffff00">${highScore}</span></div>
                <div class="go-stat"><span class="go-stat-label">WAVES</span><span class="go-stat-val" style="color:#00ffff">${wave}</span></div>
                <div class="go-stat"><span class="go-stat-label">KILLS</span><span class="go-stat-val" style="color:#ff4466">${killCount}</span></div>
                <div class="go-stat"><span class="go-stat-label">ACCURACY</span><span class="go-stat-val" style="color:#ff8800">${acc}%</span></div>
                <div class="go-stat"><span class="go-stat-label">SURVIVED</span><span class="go-stat-val" style="color:#aa00ff">${timeStr}</span></div>
            </div>
            <div class="go-xp-row">+${xpEarned} XP &nbsp;·&nbsp; ${newRank.name}</div>
            ${rankBar}
            <button onclick="location.reload()">REBOOT</button>
        </div>
    `;

    if (rankedUp) Sound.rankUp();

    // Update menu rank display (in case they go back somehow)
    updateMenuRankDisplay();
}

// ── Start / Begin ──

function startGame() {
    checkDevice();
    if (isMobile) {
        requestFullscreen();
        if (!isLandscape()) { updateOrientationOverlay(); return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const c = CHARS[selectedChar];
    playerSpeed = c.speed; playerMaxHp = c.maxHp; shootCooldown = c.cooldown;
    bulletDmg = c.dmg; maxClip = c.clip; ammo = c.clip; burstCount = c.burst;
    hp = c.maxHp; reserve = c.reserve; boosts = {};

    // Reset run stats
    killCount = 0; shotsFired = 0; shotsHit = 0;
    runSpeedPickups = 0; waveDamageTaken = 0;
    comboCount = 0; comboMultiplier = 1;
    hasSecondaryWeapon = false; secondaryAmmo = 0;
    killFeedEntries = [];
    runStartTime = Date.now();

    document.getElementById('menu').style.display = 'none';
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
    gameRunning = true;
    if (tutorialMode) {
        document.getElementById('wave-status').innerText = 'TRAINING';
        initTutorialPhases();
    } else {
        startWave(1);
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
        const visible = settings.aiTrainButtonVisible !== false;
        aiTrainToggle.innerText = visible ? 'ON' : 'OFF';
        aiTrainToggle.classList.toggle('on', visible);
    }
}

function toggleAITrainButtonSetting() {
    settings.aiTrainButtonVisible = !settings.aiTrainButtonVisible;
    saveSettings();
    updateSettingsUI();
    if (typeof window.setNexusTrainButtonVisible === 'function') {
        window.setNexusTrainButtonVisible(settings.aiTrainButtonVisible);
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
    gamePaused = !gamePaused;
    if (gamePaused) {
        document.exitPointerLock();
        document.getElementById('pause-menu').style.display = 'flex';
    } else {
        resumeGame();
    }
}

function resumeGame() {
    gamePaused = false;
    document.getElementById('pause-menu').style.display = 'none';
    if (!isMobile) document.body.requestPointerLock();
    // Only restart the loop if it was fully stopped (not just paused)
    animate();
}

function exitToMenu() {
    if (score > highScore) { highScore = score; localStorage.setItem('msc_highscore', highScore); }
    window.location.reload();
}

document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && gameRunning && !gamePaused) {
        gamePaused = true;
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

document.getElementById('menu-hs').innerText = highScore;

// Init rank display on menu
updateMenuRankDisplay();

// Auto-show tutorial on very first visit
if (!localStorage.getItem('msc_tut_done')) {
    openTutorial();
}
