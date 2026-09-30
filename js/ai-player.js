// ── js/ai_player.js ──
// NEXUS AI — Tactical Player Controller v3 (Memory Safe)

const NEXUS = (() => {
    'use strict';

    // ─────────────────────────────────────────────────────────────
    //  PERSISTENCE / LEARNING
    // ─────────────────────────────────────────────────────────────
    const MEM_KEY = 'nexus_memory_v2';
    let mem = (() => {
        try { return JSON.parse(localStorage.getItem(MEM_KEY)) || {}; } catch { return {}; }
    })();
    mem.threatDeaths = mem.threatDeaths || { scout:0, sniper:0, bomber:0, tank:0, boss:0, runner:0 };
    mem.totalRuns    = mem.totalRuns    || 0;
    mem.bestWave     = mem.bestWave     || 0;
    mem.dangerZones  = mem.dangerZones  || [];

    function saveMem() {
        try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch {}
    }

    // ─────────────────────────────────────────────────────────────
    //  AI STATE
    // ─────────────────────────────────────────────────────────────
    let active  = false;
    let rafId   = null;

    const ai = {
        phase:       'IDLE',
        strafeDir:   1,
        strafeTimer: 0,
        lastHp:      100,
        lastPos:     null,
        stuckTicks:  0,
        log:         [],
        hudTick:     0,
        threatScore: 0,
    };

    // ─────────────────────────────────────────────────────────────
    //  THREAT SCORING
    // ─────────────────────────────────────────────────────────────
    function scoreEnemy(e) {
        if (!player) return 0;
        const d    = player.position.distanceTo(e.mesh.position);
        const hpF  = hp / playerMaxHp;
        const name = (e.name || '').toLowerCase();
        let   s    = 0;

        if (e.isBoss)            s = 2000;
        else if (name==='bomber')  s = 600 - d * 10;
        else if (name==='scout')   s = 350 - d * 1.5;
        else if (name==='sniper')  s = 220;
        else if (name==='runner')  s = 130 - d;
        else if (name==='tank')    s = 90;
        else                       s = 110;

        if (name !== 'sniper') s += Math.max(0, 28 - d) * 5;
        if (hpF < 0.35) s *= 1.5;
        s += (mem.threatDeaths[name] || 0) * 18;
        s += Math.max(0, 80 - e.hp) * 0.4;

        // Heavily penalize enemies we can't see — prefer visible targets
        if (!hasLineOfSight(player.position, e.mesh.position)) s -= 800;

        return s;
    }

    function getBestTarget() {
        if (!enemies || !enemies.length) return null;
        let best = null, bS = -Infinity;
        for (const e of enemies) { const s = scoreEnemy(e); if (s > bS) { bS = s; best = e; } }
        ai.threatScore = bS;
        return best;
    }

    // ─────────────────────────────────────────────────────────────
    //  DROP SCORING
    // ─────────────────────────────────────────────────────────────
    function scoreDrop(d) {
        if (!player) return -1;
        const dist = player.position.distanceTo(d.mesh.position);
        const hpF  = hp / playerMaxHp;
        const ammoT = ammo + reserve;
        let s = 0;

        if (d.type === 'hp') {
            if      (hpF < 0.30) s = 1000;
            else if (hpF < 0.50) s = 600;
            else if (hpF < 0.75) s = 200;
            else                 s = 40;
        } else if (d.type === 'ammo') {
            // Desperate: out of ammo entirely — highest possible priority
            if      (ammo === 0 && reserve === 0) s = 1100;
            else if (ammo <= 2 && reserve === 0)  s = 950;
            else if (ammoT < 10)                  s = 500;
            else if (ammoT < 24)                  s = 150;
            else                                  s = 40;
        } else if (d.type === 'secondary') {
            s = 700;
        } else if (d.type === 'powerup') {
            const vals = { overclock:600, shield:500, rapid:400, speed:300 };
            s = vals[d.powerup] || 250;
            if (d.powerup === 'shield'    && enemies && enemies.length > 4) s += 200;
            if (d.powerup === 'overclock' && isBossWave) s += 400;
        }

        // Reduced distance penalty (was *5 — too harsh for powerups at mid range)
        s -= dist * 2.5;

        // Only suppress non-critical non-hp drops during huge enemy swarms,
        // and never suppress ammo pickups when the AI is out of ammo
        const ammoEmergency = (d.type === 'ammo' && ammo === 0 && reserve === 0);
        if (!ammoEmergency && enemies && enemies.length > 6 && hpF > 0.65 && d.type !== 'hp') {
            s *= 0.6; // was 0.3 — less extreme suppression so powerups still register
        }
        return s;
    }

    function getBestDrop() {
        if (!drops || !drops.length) return null;

        // Emergency ammo override: if completely dry, pick nearest ammo drop regardless of score
        if (ammo === 0 && reserve === 0) {
            const ammoDrop = drops
                .filter(d => d.type === 'ammo')
                .sort((a, b) =>
                    player.position.distanceTo(a.mesh.position) -
                    player.position.distanceTo(b.mesh.position)
                )[0];
            if (ammoDrop) return ammoDrop;
        }

        let best = null, bS = -Infinity;
        for (const d of drops) { const s = scoreDrop(d); if (s > bS) { bS = s; best = d; } }
        return (bS > 30) ? best : null;
    }

    // ─────────────────────────────────────────────────────────────
    //  AIM — directly writes yaw / pitch globals
    // ─────────────────────────────────────────────────────────────
    function aimAt(worldPos) {
        const dx  = worldPos.x - player.position.x;
        const dz  = worldPos.z - player.position.z;
        const dy  = (worldPos.y != null ? worldPos.y : player.position.y) - player.position.y + 0.3;
        const hd  = Math.sqrt(dx * dx + dz * dz);

        const tYaw   = Math.atan2(-dx, -dz);
        const tPitch = Math.atan2(dy, hd);

        let dYaw = tYaw - yaw;
        while (dYaw >  Math.PI) dYaw -= 2 * Math.PI;
        while (dYaw < -Math.PI) dYaw += 2 * Math.PI;

        yaw   += dYaw   * 0.18;
        pitch += (tPitch - pitch) * 0.25;
        pitch  = Math.max(-1.4, Math.min(1.4, pitch));

        return Math.abs(dYaw) < 0.10;
    }

    // ─────────────────────────────────────────────────────────────
    //  MOVE — directly pushes player.position in world-space
    //  Mirrors the game loop's own collision handling exactly.
    // ─────────────────────────────────────────────────────────────
    function moveWorld(wx, wz) {
        const sp  = (boosts && boosts.speed && Date.now() < boosts.speed)
                    ? playerSpeed * 1.8 : playerSpeed;
        const len = Math.sqrt(wx * wx + wz * wz) || 1;
        const mx  = (wx / len) * sp;
        const mz  = (wz / len) * sp;

        player.position.x += mx;
        if (checkCollision(player.position, 0.7)) player.position.x -= mx;

        player.position.z += mz;
        if (checkCollision(player.position, 0.7)) player.position.z -= mz;
    }

    // ─────────────────────────────────────────────────────────────
    //  STUCK DETECTION
    // ─────────────────────────────────────────────────────────────
    function checkStuck() {
        if (!ai.lastPos) { ai.lastPos = { x: player.position.x, z: player.position.z }; return; }
        const moved = Math.hypot(
            player.position.x - ai.lastPos.x,
            player.position.z - ai.lastPos.z
        );
        ai.stuckTicks = (moved < 0.02) ? ai.stuckTicks + 1 : 0;
        ai.lastPos = { x: player.position.x, z: player.position.z };

        if (ai.stuckTicks > 18) {
            ai.stuckTicks  = 0;
            ai.strafeDir  *= -1;
            ai.strafeTimer = 0;
            const ang = Math.random() * Math.PI * 2;
            moveWorld(Math.cos(ang) * 3, Math.sin(ang) * 3);
            log('UNSTUCK — nudge');
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  DANGER ZONES
    // ─────────────────────────────────────────────────────────────
    function markDanger(pos) {
        mem.dangerZones.push({ x: pos.x, z: pos.z, t: Date.now() });
        if (mem.dangerZones.length > 60) mem.dangerZones.shift();
        saveMem();
    }

    function inDanger(x, z) {
        const now = Date.now();
        return mem.dangerZones.some(dz =>
            (now - dz.t) < 25000 && Math.hypot(dz.x - x, dz.z - z) < 6
        );
    }

    // ─────────────────────────────────────────────────────────────
    //  STRAFE HELPER
    // ─────────────────────────────────────────────────────────────
    function strafeVec(ux, uz) {
        ai.strafeTimer--;
        if (ai.strafeTimer <= 0) {
            ai.strafeDir  *= -1;
            ai.strafeTimer = 10 + Math.floor(Math.random() * 16);
        }
        return { x: -uz * ai.strafeDir, z: ux * ai.strafeDir };
    }

    // ─────────────────────────────────────────────────────────────
    //  LINE-OF-SIGHT — ray vs AABB slab test (XZ plane)
    //  Returns true if the path from 'from' to 'to' is clear of
    //  all buildings. Uses the slab method on each building AABB.
    // ─────────────────────────────────────────────────────────────
    function hasLineOfSight(from, to) {
        if (!buildings || !buildings.length) return true;

        const dx = to.x - from.x;
        const dz = to.z - from.z;

        for (const b of buildings) {
            // Tiny margin so the ray catches near-grazes
            const margin = 0.4;
            const minX = b.minX - margin, maxX = b.maxX + margin;
            const minZ = b.minZ - margin, maxZ = b.maxZ + margin;

            // Skip if either endpoint is already inside this building
            const fromIn = from.x > minX && from.x < maxX && from.z > minZ && from.z < maxZ;
            const toIn   =   to.x > minX &&   to.x < maxX &&   to.z > minZ &&   to.z < maxZ;
            if (fromIn || toIn) continue;

            // X-axis slab
            let tMinX = -Infinity, tMaxX = Infinity;
            if (Math.abs(dx) > 1e-9) {
                const t1 = (minX - from.x) / dx;
                const t2 = (maxX - from.x) / dx;
                tMinX = Math.min(t1, t2);
                tMaxX = Math.max(t1, t2);
            } else {
                if (from.x < minX || from.x > maxX) continue; // parallel and outside
            }

            // Z-axis slab
            let tMinZ = -Infinity, tMaxZ = Infinity;
            if (Math.abs(dz) > 1e-9) {
                const t1 = (minZ - from.z) / dz;
                const t2 = (maxZ - from.z) / dz;
                tMinZ = Math.min(t1, t2);
                tMaxZ = Math.max(t1, t2);
            } else {
                if (from.z < minZ || from.z > maxZ) continue;
            }

            // Slab overlap within segment [0, 1]
            const tEnter = Math.max(tMinX, tMinZ);
            const tExit  = Math.min(tMaxX, tMaxZ);
            if (tEnter < tExit && tEnter < 1.0 && tExit > 0.0) {
                return false; // blocked
            }
        }
        return true;
    }

    // ─────────────────────────────────────────────────────────────
    //  ROCKET LOGIC
    // ─────────────────────────────────────────────────────────────
    function considerRocket(tgt) {
        if (!hasSecondaryWeapon || secondaryAmmo <= 0 || !tgt) return;
        const d = player.position.distanceTo(tgt.mesh.position);
        if (d < 5 || d > 55) return;
        if (!hasLineOfSight(player.position, tgt.mesh.position)) return;

        const cluster = enemies.filter(e =>
            e.mesh.position.distanceTo(tgt.mesh.position) < 8
        ).length;

        if (tgt.isBoss || cluster >= 3 || (tgt.name === 'TANK' && d < 22)) {
            if (aimAt(tgt.mesh.position)) {
                fireSecondary();
                log(`ROCKET → ${tgt.isBoss ? 'BOSS' : tgt.name} cluster:${cluster}`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  PREFERRED ENGAGEMENT DISTANCES
    // ─────────────────────────────────────────────────────────────
    const PREF = { bomber:14, sniper:11, scout:8, runner:15, tank:12 };

    // ─────────────────────────────────────────────────────────────
    //  PHASE DETERMINATION
    // ─────────────────────────────────────────────────────────────
    function getPhase(tgt, dp) {
        const hpF = hp / playerMaxHp;

        const closeBomber = enemies && enemies.find(e =>
            e.name === 'BOMBER' &&
            player.position.distanceTo(e.mesh.position) < 13
        );

        if (!enemies || enemies.length === 0)          return dp ? 'SEEK_DROP' : 'IDLE';
        if (closeBomber)                                return 'EVADE_BOMBER';

        // Critical HP — seek HP drop or kite
        if (hpF < 0.28) {
            const hpDrop = drops && drops.find(d => d.type === 'hp');
            return hpDrop ? 'SEEK_DROP' : 'KITE';
        }

        // Out of ammo entirely — always seek nearest ammo drop, even mid-combat
        if (ammo === 0 && reserve === 0) {
            const ammoDrop = drops && drops.find(d => d.type === 'ammo');
            if (ammoDrop) return 'SEEK_DROP';
        }

        // Seek any high-value drop nearby (lowered threshold from 300 to 200 for powerups)
        if (dp && scoreDrop(dp) > 200 &&
            player.position.distanceTo(dp.mesh.position) < 35) return 'SEEK_DROP';

        if (tgt && tgt.name === 'SNIPER' &&
            player.position.distanceTo(tgt.mesh.position) > 18)  return 'KITE';

        return 'HUNT';
    }

    // ─────────────────────────────────────────────────────────────
    //  PHASE EXECUTORS
    // ─────────────────────────────────────────────────────────────

    function doIdle(dp) {
        if (dp) { ai.phase = 'SEEK_DROP'; }
        else    { yaw += 0.008; }
    }

    function doHunt(tgt) {
        if (!tgt) { doIdle(null); return; }

        const los = hasLineOfSight(player.position, tgt.mesh.position);

        aimAt(tgt.mesh.position);

        const d    = player.position.distanceTo(tgt.mesh.position);
        const name = (tgt.name || '').toLowerCase();
        const pref = PREF[name] || 18;

        const dx = tgt.mesh.position.x - player.position.x;
        const dz = tgt.mesh.position.z - player.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const ux = dx / len, uz = dz / len;
        const sv = strafeVec(ux, uz);

        let wx, wz;
        if (!los) {
            // No line of sight — move toward enemy while strafing hard to one side
            // to flank around the building. Pure strafe lets us slide along the wall.
            wx = ux * 0.5 + sv.x * 1.2;
            wz = uz * 0.5 + sv.z * 1.2;
        } else if (d > pref + 2) {
            wx = ux * 0.85 + sv.x * 0.55;
            wz = uz * 0.85 + sv.z * 0.55;
        } else if (d < pref - 2) {
            wx = -ux * 0.85 + sv.x * 0.55;
            wz = -uz * 0.85 + sv.z * 0.55;
        } else {
            wx = sv.x;
            wz = sv.z;
        }

        if (inDanger(player.position.x + wx * 2, player.position.z + wz * 2)) {
            wx = -wx; wz = -wz;
        }

        moveWorld(wx, wz);

        // Only shoot when we actually have line of sight
        if (los && ammo > 0 && !isReloading) shoot();
        else if (ammo === 0 && reserve === 0) {
            // Completely out of ammo and no drop yet — kite away from enemies
            const dx = player.position.x - tgt.mesh.position.x;
            const dz = player.position.z - tgt.mesh.position.z;
            const len = Math.sqrt(dx*dx + dz*dz) || 1;
            moveWorld(dx / len, dz / len);
        }
        considerRocket(tgt);
    }

    function doKite(tgt) {
        if (!tgt) { doIdle(null); return; }

        aimAt(tgt.mesh.position);

        const dx  = tgt.mesh.position.x - player.position.x;
        const dz  = tgt.mesh.position.z - player.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const ux = dx / len, uz = dz / len;
        const sv = strafeVec(ux, uz);

        moveWorld(-ux * 0.6 + sv.x * 0.8, -uz * 0.6 + sv.z * 0.8);

        if (hasLineOfSight(player.position, tgt.mesh.position) && ammo > 0 && !isReloading) shoot();
    }

    function doSeekDrop(dp, tgt) {
        if (!dp || !dp.mesh) { ai.phase = 'HUNT'; return; }

        if (tgt) {
            aimAt(tgt.mesh.position);
            const los = hasLineOfSight(player.position, tgt.mesh.position);
            if (los && player.position.distanceTo(tgt.mesh.position) < 35 && ammo > 0 && !isReloading) shoot();
        } else {
            aimAt(dp.mesh.position);
        }

        const dx   = dp.mesh.position.x - player.position.x;
        const dz   = dp.mesh.position.z - player.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        if (dist < 1.8) {
            ai.phase = 'HUNT';
            log(`COLLECTED ${dp.type.toUpperCase()}`);
            return;
        }

        moveWorld(dx / dist, dz / dist);
    }

    function doEvadeBomber(bomber, tgt) {
        if (!bomber || !bomber.mesh) { ai.phase = 'HUNT'; return; }

        aimAt(bomber.mesh.position);
        if (hasLineOfSight(player.position, bomber.mesh.position) && ammo > 0 && !isReloading) shoot();

        const dx  = player.position.x - bomber.mesh.position.x;
        const dz  = player.position.z - bomber.mesh.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        moveWorld(dx / len, dz / len);
    }

    // ─────────────────────────────────────────────────────────────
    //  MAIN FRAME HOOK
    // ─────────────────────────────────────────────────────────────
    function frame() {
        if (!active) return;
        rafId = requestAnimationFrame(frame);

        if (!gameRunning || gamePaused || !player || hp <= 0) return;

        // Auto-reload
        if (ammo <= 2 && reserve > 0 && !isReloading) reload();

        // Damage detection
        if (hp < ai.lastHp - 1) {
            markDanger(player.position);
            const tgt = getBestTarget();
            if (tgt) {
                const n = (tgt.name || '').toLowerCase();
                mem.threatDeaths[n] = (mem.threatDeaths[n] || 0) + 0.15;
                saveMem();
            }
        }
        ai.lastHp = hp;

        checkStuck();

        const tgt = getBestTarget();
        const dp  = getBestDrop();

        const closeBomber = enemies && enemies.find(e =>
            e.name === 'BOMBER' &&
            player.position.distanceTo(e.mesh.position) < 13
        );

        const newPhase = getPhase(tgt, dp);
        if (newPhase !== ai.phase) {
            log(`→ ${newPhase}${tgt ? ' [' + (tgt.isBoss ? 'BOSS' : tgt.name) + ']' : ''} hp:${Math.ceil(hp)}`);
            ai.phase = newPhase;
        }

        switch (ai.phase) {
            case 'IDLE':         doIdle(dp);                       break;
            case 'HUNT':         doHunt(tgt);                      break;
            case 'KITE':         doKite(tgt);                      break;
            case 'SEEK_DROP':    doSeekDrop(dp, tgt);              break;
            case 'EVADE_BOMBER': doEvadeBomber(closeBomber, tgt);  break;
        }

        // HUD every 4 frames
        if (++ai.hudTick % 4 === 0) updateHUD();
    }

    // ─────────────────────────────────────────────────────────────
    //  LOGGING
    // ─────────────────────────────────────────────────────────────
    function log(msg) {
        ai.log.unshift(msg);
        if (ai.log.length > 10) ai.log.pop();
    }

    // ─────────────────────────────────────────────────────────────
    //  POINTER-LOCK PATCH
    // ─────────────────────────────────────────────────────────────
    let plPatched = false;
    function patchPointerLock() {
        if (plPatched) return;
        plPatched = true;
        document.addEventListener('pointerlockchange', () => {
            if (active && gameRunning && !document.pointerLockElement) {
                setTimeout(() => {
                    if (active && gamePaused) {
                        gamePaused = false;
                        const pm = document.getElementById('pause-menu');
                        if (pm) pm.style.display = 'none';
                    }
                }, 8);
            }
        }, true);
    }

    // ─────────────────────────────────────────────────────────────
    //  AUTONOMOUS TRAINING STATE
    // ─────────────────────────────────────────────────────────────
    let training      = false;   // true = full auto-train loop running
    let trainRunCount = 0;       // runs completed this training session
    let trainHistory  = [];      // [{wave, score, kills, acc, time}] per run
    let trainStartTime = 0;
    let trainRestartTimer = null;
    let trainGameOverPatched = false;

    // ─────────────────────────────────────────────────────────────
    //  HEADLESS GAME RESET — restarts a full run without any UI
    //  interaction, pointer lock, menus, or game-over screen.
    // ─────────────────────────────────────────────────────────────
    function headlessReset() {
        // Safely dispose of all dynamic meshes before clearing the arrays
        if (typeof disposeMesh !== 'undefined') {
            if (typeof enemies !== 'undefined') enemies.forEach(e => disposeMesh(e.mesh));
            if (typeof bullets !== 'undefined') bullets.forEach(b => disposeMesh(b.mesh));
            if (typeof enemyBullets !== 'undefined') enemyBullets.forEach(eb => disposeMesh(eb.mesh));
            if (typeof drops !== 'undefined') drops.forEach(d => disposeMesh(d.mesh));
        }

        // Now empty the arrays safely
        if (typeof enemies      !== 'undefined') enemies.length      = 0;
        if (typeof bullets      !== 'undefined') bullets.length      = 0;
        if (typeof enemyBullets !== 'undefined') enemyBullets.length = 0;
        if (typeof buildings    !== 'undefined') buildings.length    = 0;
        if (typeof drops        !== 'undefined') drops.length        = 0;
        if (typeof particles    !== 'undefined') particles.length    = 0;
        if (typeof killFeedEntries !== 'undefined') killFeedEntries.length = 0;

        // Reset all game-state globals to their startGame values
        const c = CHARS[selectedChar] || CHARS['striker'];
        playerSpeed   = c.speed;
        playerMaxHp   = c.maxHp;
        shootCooldown = c.cooldown;
        bulletDmg     = c.dmg;
        maxClip       = c.clip;
        ammo          = c.clip;
        burstCount    = c.burst;
        hp            = c.maxHp;
        reserve       = c.reserve;
        boosts        = {};

        killCount    = 0; shotsFired  = 0; shotsHit      = 0;
        runSpeedPickups = 0; waveDamageTaken = 0; waveStartHp = c.maxHp;
        comboCount   = 0; comboMultiplier = 1;
        hasSecondaryWeapon = false; secondaryAmmo = 0;
        score        = 0;
        wave         = 0;
        enemiesToSpawn = 0;
        isWaveTransition = false;
        gamePaused   = false;
        isBossWave   = false;
        currentWaveModifier = null;
        isReloading  = false;
        lastShotTime = 0;
        shakeAmount  = 0;
        damageFlashAmount = 0;
        muzzleFlashAmount = 0;
        chromaAmount = 0;
        bobTime      = 0;
        runStartTime = Date.now();
        if (comboDecayTimer) { clearTimeout(comboDecayTimer); comboDecayTimer = null; }

        // Hide any leftover overlays
        ['gameover','pause-menu'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const bossBar = document.getElementById('boss-bar-wrapper');
        if (bossBar) bossBar.style.display = 'none';

        // Re-show game UI
        ['ui','crosshair','minimap'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });
        const boostsEl = document.getElementById('boosts-hud');
        if (boostsEl) boostsEl.style.display = 'flex';

        // Re-init scene and start the wave loop
        init();
        gameRunning = true;
        tutorialMode = false;
        startWave(1);
        animate();

        // Reset AI state for fresh run
        ai.lastHp    = hp;
        ai.phase     = 'IDLE';
        ai.lastPos   = null;
        ai.stuckTicks = 0;
        ai.log       = [];

        log(`RUN ${trainRunCount} START — streak: ${mem.bestWave} best`);
        updateTrainHUD();
    }

    // ─────────────────────────────────────────────────────────────
    //  PATCH triggerGameOver so training mode intercepts it
    // ─────────────────────────────────────────────────────────────
    function patchGameOver() {
        if (trainGameOverPatched) return;
        trainGameOverPatched = true;

        const _orig = window.triggerGameOver;
        window.triggerGameOver = function() {
            if (!training) {
                // Normal mode — run original
                _orig.apply(this, arguments);
                return;
            }

            // ── Training mode: record run, then restart ──
            gameRunning = false;

            const w       = typeof wave !== 'undefined' ? wave : 0;
            const s       = typeof score !== 'undefined' ? score : 0;
            const k       = typeof killCount !== 'undefined' ? killCount : 0;
            const acc     = shotsFired > 0 ? Math.round(shotsHit / shotsFired * 100) : 0;
            const elapsed = Math.round((Date.now() - runStartTime) / 1000);

            // Update persistent memory
            if (s > highScore) { highScore = s; localStorage.setItem('msc_highscore', highScore); }
            const xpEarned = Math.floor(s / 8) + k * 2 + (w - 1) * 40;
            playerXP += Math.max(0, xpEarned);
            localStorage.setItem('msc_xp', playerXP);

            mem.totalRuns++;
            trainRunCount++;
            if (w > mem.bestWave) mem.bestWave = w;
            saveMem();

            // Push to training history (keep last 50 runs for the graph)
            trainHistory.push({ wave: w, score: s, kills: k, acc, time: elapsed });
            if (trainHistory.length > 50) trainHistory.shift();

            log(`RUN ${trainRunCount} DONE — wave:${w} score:${s} kills:${k} acc:${acc}%`);
            updateTrainHUD();

            // Auto-restart after a brief pause so the screen isn't a flicker
            trainRestartTimer = setTimeout(() => {
                if (training) headlessReset();
            }, 1200);
        };
    }

    // ─────────────────────────────────────────────────────────────
    //  START / STOP TRAINING
    // ─────────────────────────────────────────────────────────────
    function startTraining() {
        if (training) return;
        training      = true;
        trainRunCount = 0;
        trainHistory  = [];
        trainStartTime = Date.now();

        patchGameOver();
        patchPointerLock();

        // Show training HUD, hide normal nexus HUD
        const hud = document.getElementById('nexus-hud');
        if (hud) hud.style.display = 'none';
        const thud = document.getElementById('nexus-train-hud');
        if (thud) thud.style.display = 'block';

        // Update button
        const btn = document.getElementById('nexus-train-btn');
        if (btn) {
            btn.innerHTML = '<span class="train-icon">■</span> STOP SIMULATION <span class="train-live-dot"></span>';
            btn.classList.add('on');
        }
        if (typeof AudioEngine !== 'undefined') AudioEngine.playTrainingStart();

        // Activate AI frame loop
        if (!active) {
            active = true;
            ai.lastHp = hp || 100;
            ai.phase  = 'IDLE';
            ai.lastPos = null;
            ai.stuckTicks = 0;
            rafId = requestAnimationFrame(frame);
        }

        // If a game is already running, let the AI take over immediately.
        // If not (we're on menu), do a headless start.
        if (!gameRunning) {
            // Minimal startGame equivalent — no pointer lock, no mobile check
            const c = CHARS[selectedChar] || CHARS['striker'];
            playerSpeed = c.speed; playerMaxHp = c.maxHp; shootCooldown = c.cooldown;
            bulletDmg = c.dmg; maxClip = c.clip; ammo = c.clip; burstCount = c.burst;
            hp = c.maxHp; reserve = c.reserve; boosts = {};
            killCount = 0; shotsFired = 0; shotsHit = 0;
            runSpeedPickups = 0; waveDamageTaken = 0;
            comboCount = 0; comboMultiplier = 1;
            hasSecondaryWeapon = false; secondaryAmmo = 0;
            killFeedEntries = [];
            runStartTime = Date.now();
            score = 0;

            document.getElementById('menu').style.display = 'none';

            ['ui','crosshair','minimap'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'block';
            });
            const boostsEl = document.getElementById('boosts-hud');
            if (boostsEl) boostsEl.style.display = 'flex';

            init();
            gameRunning = true;
            tutorialMode = false;
            startWave(1);
            animate();
        }

        log('AUTO-TRAIN STARTED');
        updateTrainHUD();
        console.log('%c[NEXUS AI] Autonomous training started — runs indefinitely until stopped.', 'color:#00ffcc;font-weight:bold');
    }

    function stopTraining() {
        if (!training) return;
        training = false;
        if (trainRestartTimer) { clearTimeout(trainRestartTimer); trainRestartTimer = null; }

        // Stop AI
        active = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

        const btn = document.getElementById('nexus-train-btn');
        if (btn) {
            btn.innerHTML = '<span class="train-icon">▶</span> AUTO TRAIN';
            btn.classList.remove('on');
        }
        if (typeof AudioEngine !== 'undefined') AudioEngine.playTrainingStop();

        const thud = document.getElementById('nexus-train-hud');
        if (thud) thud.style.display = 'block'; // keep showing final stats

        log('AUTO-TRAIN STOPPED');
        updateTrainHUD();
        console.log('%c[NEXUS AI] Training stopped.', 'color:#ff8800;font-weight:bold');
    }

    // ─────────────────────────────────────────────────────────────
    //  ENABLE / DISABLE (manual co-pilot mode, unchanged)
    // ─────────────────────────────────────────────────────────────
    function enable() {
        if (active || training) return;
        active = true;
        ai.lastHp    = hp || 100;
        ai.phase     = 'IDLE';
        ai.lastPos   = null;
        ai.stuckTicks = 0;
        patchPointerLock();
        rafId = requestAnimationFrame(frame);
        const btn = document.getElementById('nexus-btn');
        if (btn) { btn.innerHTML = '<span class="nexus-pulse-dot"></span> ■ NEXUS ONLINE'; btn.classList.add('on'); }
        const hud = document.getElementById('nexus-hud');
        if (hud) hud.style.display = 'block';
        if (typeof AudioEngine !== 'undefined') AudioEngine.playNexusActivate();
        log('NEXUS ONLINE');
        updateHUD();
    }

    function disable() {
        if (!active || training) return;
        active = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        const btn = document.getElementById('nexus-btn');
        if (btn) { btn.innerHTML = '<span class="nexus-pulse-dot off"></span> ▶ NEXUS AI'; btn.classList.remove('on'); }
        const hud = document.getElementById('nexus-hud');
        if (hud) hud.style.display = 'none';
        if (typeof AudioEngine !== 'undefined') AudioEngine.playTrainingStop();
    }

    // ─────────────────────────────────────────────────────────────
    //  COMBAT HUD (shown during manual co-pilot mode)
    // ─────────────────────────────────────────────────────────────
    function updateHUD() {
        const el = document.getElementById('nexus-hud');
        if (!el || training) return;
        const hF = player ? hp / playerMaxHp : 0;
        const hC = hF < 0.3 ? '#ff007f' : hF < 0.55 ? '#ffaa00' : '#00ff66';
        const aF = maxClip > 0 ? ammo / maxClip : 0;
        const phaseColors = {
            HUNT:'#00f0ff', KITE:'#ffaa00', SEEK_DROP:'#ff007f', EVADE_BOMBER:'#ff4400', IDLE:'#8892b0', FLANK:'#a855f7'
        };
        const pC = phaseColors[ai.phase] || '#00f0ff';
        const tgt = getBestTarget();
        const tgtName = tgt ? (tgt.isBoss ? 'BOSS // OVERLORD' : tgt.name) : 'SCANNING...';

        el.innerHTML = `
<div class="nexus-hud-header">
  <div class="nexus-title-col">
    <span class="nexus-brand">◈ NEXUS COMPANION</span>
    <span class="nexus-sub">TACTICAL PROTOCOL ACTIVE</span>
  </div>
  <span class="nexus-phase-pill" style="border-color:${pC};color:${pC};background:${pC}18;">${ai.phase}</span>
</div>

<div class="nexus-target-row">
  <span class="nexus-lbl">LOCKED TARGET</span>
  <span class="nexus-val-target" style="color:${tgt ? '#ff007f' : '#8892b0'}">${tgtName}</span>
</div>

<div class="nexus-bars-col">
  <div class="nexus-bar-row">
    <span class="nexus-mini-lbl">OPERATIVE VITALITY</span>
    <span class="nexus-mini-val" style="color:${hC}">${Math.ceil(hp)}/${playerMaxHp}</span>
  </div>
  <div class="nexus-bar-track">
    <div class="nexus-bar-fill" style="width:${(hF*100).toFixed(0)}%;background:${hC};box-shadow:0 0 8px ${hC}"></div>
  </div>

  <div class="nexus-bar-row" style="margin-top:6px;">
    <span class="nexus-mini-lbl">MUNITIONS IN CLIP</span>
    <span class="nexus-mini-val" style="color:#00f0ff">${ammo}/${maxClip}</span>
  </div>
  <div class="nexus-bar-track">
    <div class="nexus-bar-fill" style="width:${(aF*100).toFixed(0)}%;background:#00f0ff;box-shadow:0 0 8px #00f0ff"></div>
  </div>
</div>

<div class="nexus-grid-metrics">
  <div class="nexus-metric-box">
    <span class="nexus-metric-lbl">HOSTILES</span>
    <span class="nexus-metric-num" style="color:#ff007f">${enemies ? enemies.length : 0}</span>
  </div>
  <div class="nexus-metric-box">
    <span class="nexus-metric-lbl">DROPS</span>
    <span class="nexus-metric-num" style="color:#00ff66">${drops ? drops.length : 0}</span>
  </div>
  <div class="nexus-metric-box">
    <span class="nexus-metric-lbl">THREAT INDEX</span>
    <span class="nexus-metric-num" style="color:#ffaa00">${ai.threatScore.toFixed(0)}</span>
  </div>
</div>

<div class="nexus-log-container">
  <div class="nexus-log-title">TELEMETRY FEED</div>
  ${ai.log.slice(0,4).map(l=>`<div class="nexus-log-line">${l}</div>`).join('')}
</div>`;
    }

    // ─────────────────────────────────────────────────────────────
    //  TRAINING HUD — live stats + sparkline graph
    // ─────────────────────────────────────────────────────────────
    function updateTrainHUD() {
        const el = document.getElementById('nexus-train-hud');
        if (!el) return;

        const totalSecs  = Math.floor((Date.now() - trainStartTime) / 1000);
        const mm = String(Math.floor(totalSecs / 60)).padStart(2,'0');
        const ss = String(totalSecs % 60).padStart(2,'0');
        const elapsed    = `${mm}:${ss}`;

        const avgWave    = trainHistory.length
            ? (trainHistory.reduce((s,r) => s + r.wave, 0) / trainHistory.length).toFixed(1) : '–';
        const avgAcc     = trainHistory.length
            ? Math.round(trainHistory.reduce((s,r) => s + r.acc, 0)  / trainHistory.length) + '%' : '–';
        const totalKills = trainHistory.reduce((s,r) => s + r.kills, 0);

        // Trend: is performance improving?
        let trend = '';
        if (trainHistory.length >= 6) {
            const half = Math.floor(trainHistory.length / 2);
            const early = trainHistory.slice(0, half).reduce((s,r) => s + r.wave, 0) / half;
            const late  = trainHistory.slice(-half).reduce((s,r) => s + r.wave, 0) / half;
            const delta = late - early;
            if      (delta >  1.5) trend = '<span style="color:#00ff66">▲ IMPROVING</span>';
            else if (delta < -1.5) trend = '<span style="color:#ff007f">▼ DECLINING</span>';
            else                   trend = '<span style="color:#ffaa00">◆ STABLE</span>';
        }

        // Sparkline: mini SVG bar chart of wave reached per run
        let sparkline = '';
        if (trainHistory.length > 1) {
            const maxW  = Math.max(...trainHistory.map(r => r.wave), 1);
            const bars  = trainHistory.slice(-20); // last 20 runs
            const bw    = 240 / bars.length;
            const rects = bars.map((r, i) => {
                const h   = Math.max(3, Math.round((r.wave / maxW) * 38));
                const x   = i * bw;
                const y   = 40 - h;
                const col = r.wave >= mem.bestWave ? '#00ff66' : r.wave >= avgWave ? '#00f0ff' : '#4a5568';
                return `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, (bw - 2)).toFixed(1)}" height="${h}" fill="${col}" rx="2"/>`;
            }).join('');
            sparkline = `
<div class="train-chart-box">
  <div class="train-chart-header">
    <span>WAVE PERFORMANCE</span>
    <span>LAST ${bars.length} RUNS</span>
  </div>
  <svg width="240" height="42" style="display:block;border-radius:6px;background:rgba(0,0,0,0.4)">
    ${rects}
    <line x1="0" y1="41" x2="240" y2="41" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
  </svg>
</div>`;
        }

        // Threat learning table
        const threats = mem.threatDeaths;
        const topThreat = Object.entries(threats).sort((a,b) => b[1]-a[1])[0];
        const threatStr = topThreat && topThreat[1] > 0
            ? `<span style="color:#ff007f;font-weight:bold">${topThreat[0].toUpperCase()}</span> <span style="color:#718096">(${topThreat[1].toFixed(1)} deaths)</span>`
            : '<span style="color:#718096">NONE LOGGED</span>';

        const phaseColors = {
            HUNT:'#00f0ff', KITE:'#ffaa00', SEEK_DROP:'#ff007f', EVADE_BOMBER:'#ff4400', IDLE:'#8892b0', FLANK:'#a855f7'
        };
        const pC = phaseColors[ai.phase] || '#00f0ff';

        el.innerHTML = `
<div class="nexus-hud-header">
  <div class="nexus-title-col">
    <span class="nexus-brand">◈ AUTONOMOUS LAB</span>
    <span class="nexus-sub">CONTINUOUS HEURISTIC CYCLE</span>
  </div>
  <span class="nexus-phase-pill" style="border-color:${training ? '#00ff66' : '#ffaa00'};color:${training ? '#00ff66' : '#ffaa00'};background:${training ? 'rgba(0,255,102,0.15)' : 'rgba(255,170,0,0.15)'}">
    ${training ? '● LIVE RUN' : '■ STANDBY'}
  </span>
</div>

<div class="train-stats-grid">
  <div class="train-stat-card"><span class="train-stat-label">SESSION</span><span class="train-stat-val">${elapsed}</span></div>
  <div class="train-stat-card"><span class="train-stat-label">RUNS</span><span class="train-stat-val">${trainRunCount}</span></div>
  <div class="train-stat-card"><span class="train-stat-label">RECORD</span><span class="train-stat-val" style="color:#00ff66">W${mem.bestWave}</span></div>
  <div class="train-stat-card"><span class="train-stat-label">AVG WAVE</span><span class="train-stat-val" style="color:#00f0ff">${avgWave}</span></div>
  <div class="train-stat-card"><span class="train-stat-label">ACCURACY</span><span class="train-stat-val" style="color:#ffaa00">${avgAcc}</span></div>
  <div class="train-stat-card"><span class="train-stat-label">ELIMINATIONS</span><span class="train-stat-val" style="color:#ff007f">${totalKills}</span></div>
</div>

<div class="train-info-row">
  <span class="train-info-lbl">PRIMARY THREAT:</span>
  <span>${threatStr}</span>
</div>

<div class="train-info-row">
  <span class="train-info-lbl">TRAJECTORY:</span>
  <span>${trend || '<span style="color:#718096">GATHERING SAMPLES</span>'}</span>
</div>

<div class="train-info-row">
  <span class="train-info-lbl">LIVE STATUS:</span>
  <span style="color:${pC};font-weight:bold">${ai.phase} // WAVE ${typeof wave!=='undefined'?wave:'–'}</span>
</div>

${sparkline}

<button id="nexus-reset-btn" onclick="NEXUS.resetMemory(); if (typeof Sound !== 'undefined') Sound.uiClick();">↺ RECALIBRATE MEMORY ARCHIVE</button>`;
    }

    // ─────────────────────────────────────────────────────────────
    //  INIT UI
    // ─────────────────────────────────────────────────────────────
    function injectUI() {
        if (document.getElementById('nexus-train-btn')) return;

        const s = document.createElement('style');
        s.textContent = `
        /* ── NEXUS HUD Cyber Redesign ── */
        #nexus-hud {
            position: fixed;
            top: 20px;
            right: 200px;
            width: 270px;
            background: rgba(10, 13, 22, 0.94);
            border: 1px solid rgba(0, 240, 255, 0.35);
            border-radius: 16px;
            padding: 14px 16px;
            font-family: 'Space Grotesk', sans-serif;
            color: #f8faff;
            z-index: 9999;
            pointer-events: none;
            backdrop-filter: blur(12px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 240, 255, 0.12);
            display: none;
            overflow: hidden;
        }
        #nexus-hud::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0; height: 1px;
            background: linear-gradient(90deg, transparent, #00f0ff, transparent);
            animation: radarSweep 3s infinite linear;
        }
        @keyframes radarSweep {
            0% { transform: translateY(-10px); opacity: 0; }
            50% { opacity: 0.8; }
            100% { transform: translateY(300px); opacity: 0; }
        }

        #nexus-train-hud {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 276px;
            background: rgba(10, 13, 22, 0.95);
            border: 1px solid rgba(0, 255, 102, 0.4);
            border-radius: 18px;
            padding: 16px 18px;
            font-family: 'Space Grotesk', sans-serif;
            color: #f8faff;
            z-index: 9999;
            pointer-events: auto;
            backdrop-filter: blur(14px);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7), 0 0 24px rgba(0, 255, 102, 0.15);
            display: none;
        }

        .nexus-hud-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding-bottom: 8px;
            margin-bottom: 10px;
        }
        .nexus-title-col {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }
        .nexus-brand {
            font-family: 'Syne', sans-serif;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 1px;
            color: #00f0ff;
        }
        .nexus-sub {
            font-family: 'JetBrains Mono', monospace;
            font-size: 8px;
            letter-spacing: 1px;
            color: rgba(255, 255, 255, 0.4);
        }
        .nexus-phase-pill {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 6px;
            border: 1px solid;
            letter-spacing: 1px;
        }

        .nexus-target-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            background: rgba(255, 255, 255, 0.03);
            padding: 6px 10px;
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .nexus-lbl {
            font-family: 'JetBrains Mono', monospace;
            font-size: 9px;
            letter-spacing: 1px;
            color: rgba(255, 255, 255, 0.5);
        }
        .nexus-val-target {
            font-family: 'Syne', sans-serif;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 1px;
        }

        .nexus-bars-col {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 12px;
        }
        .nexus-bar-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .nexus-mini-lbl {
            font-family: 'JetBrains Mono', monospace;
            font-size: 8px;
            color: rgba(255, 255, 255, 0.45);
        }
        .nexus-mini-val {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
        }
        .nexus-bar-track {
            height: 4px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 999px;
            overflow: hidden;
        }
        .nexus-bar-fill {
            height: 100%;
            border-radius: 999px;
            transition: width 0.15s;
        }

        .nexus-grid-metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            margin-bottom: 10px;
        }
        .nexus-metric-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 6px 4px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .nexus-metric-lbl {
            font-family: 'JetBrains Mono', monospace;
            font-size: 8px;
            color: rgba(255, 255, 255, 0.4);
            letter-spacing: 0.5px;
        }
        .nexus-metric-num {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            font-weight: 800;
        }

        .nexus-log-container {
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding-top: 8px;
        }
        .nexus-log-title {
            font-family: 'JetBrains Mono', monospace;
            font-size: 8px;
            letter-spacing: 1.5px;
            color: rgba(255, 255, 255, 0.35);
            margin-bottom: 4px;
        }
        .nexus-log-line {
            font-family: 'JetBrains Mono', monospace;
            font-size: 9px;
            color: rgba(248, 250, 255, 0.65);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.4;
        }

        /* ── Training HUD Details ── */
        .train-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            margin-bottom: 12px;
        }
        .train-stat-card {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 6px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 8px;
        }
        .train-stat-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 8px;
            letter-spacing: 0.5px;
            color: rgba(255, 255, 255, 0.4);
        }
        .train-stat-val {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            font-weight: 800;
            color: #ffffff;
        }
        .train-info-row {
            display: flex;
            justify-content: space-between;
            font-family: 'JetBrains Mono', monospace;
            font-size: 9px;
            margin-bottom: 6px;
            padding: 4px 8px;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 6px;
        }
        .train-info-lbl {
            color: rgba(255, 255, 255, 0.45);
        }
        .train-chart-box {
            margin: 10px 0 12px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding-top: 8px;
        }
        .train-chart-header {
            display: flex;
            justify-content: space-between;
            font-family: 'JetBrains Mono', monospace;
            font-size: 8px;
            letter-spacing: 1px;
            color: rgba(255, 255, 255, 0.4);
            margin-bottom: 6px;
        }
        #nexus-reset-btn {
            display: block;
            width: 100%;
            padding: 8px 12px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 1px;
            background: rgba(255, 0, 127, 0.1);
            border: 1px solid rgba(255, 0, 127, 0.35);
            color: #ff007f;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
        }
        #nexus-reset-btn:hover {
            background: rgba(255, 0, 127, 0.25);
            box-shadow: 0 0 16px rgba(255, 0, 127, 0.4);
        }

        /* ── NEXUS Buttons (Bottom-Right) ── */
        #nexus-btn {
            position: fixed;
            bottom: 94px;
            right: 20px;
            background: rgba(14, 16, 26, 0.88);
            border: 1px solid rgba(0, 240, 255, 0.4);
            color: #00f0ff;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1.5px;
            padding: 8px 16px;
            cursor: pointer;
            border-radius: 10px;
            z-index: 9999;
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        }
        #nexus-btn:hover {
            border-color: #00f0ff;
            background: rgba(0, 240, 255, 0.15);
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.3);
            transform: translateY(-2px);
        }
        #nexus-btn.on {
            background: rgba(0, 240, 255, 0.2);
            border-color: #00f0ff;
            box-shadow: 0 0 20px rgba(0, 240, 255, 0.4);
        }
        .nexus-pulse-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #00ff66;
            box-shadow: 0 0 8px #00ff66;
            animation: blinkDot 0.8s infinite alternate;
        }
        .nexus-pulse-dot.off {
            background: #718096;
            box-shadow: none;
            animation: none;
        }

        /* AUTO TRAIN button */
        #nexus-train-btn {
            position: fixed;
            bottom: 46px;
            right: 20px;
            background: linear-gradient(135deg, rgba(14, 16, 26, 0.95), rgba(20, 25, 38, 0.95));
            border: 1px solid rgba(0, 255, 102, 0.45);
            color: #00ff66;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 2px;
            padding: 10px 18px;
            cursor: pointer;
            border-radius: 12px;
            z-index: 9999;
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        #nexus-train-btn:hover {
            border-color: #00ff66;
            background: rgba(0, 255, 102, 0.15);
            box-shadow: 0 0 24px rgba(0, 255, 102, 0.35);
            transform: translateY(-2px);
        }
        #nexus-train-btn.on {
            border-color: #ff007f;
            color: #ff007f;
            background: rgba(255, 0, 127, 0.15);
            box-shadow: 0 0 30px rgba(255, 0, 127, 0.45);
            animation: trainLivePulse 1.4s ease-in-out infinite alternate;
        }
        @keyframes trainLivePulse {
            from { box-shadow: 0 0 16px rgba(255, 0, 127, 0.3); }
            to   { box-shadow: 0 0 32px rgba(255, 0, 127, 0.7); }
        }
        .train-icon {
            font-size: 11px;
        }
        .train-live-dot {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #ff007f;
            box-shadow: 0 0 8px #ff007f;
            animation: blinkDot 0.6s infinite alternate;
        }
        `;
        document.head.appendChild(s);

        // Combat co-pilot HUD (manual mode only)
        const hud = document.createElement('div');
        hud.id = 'nexus-hud';
        document.body.appendChild(hud);

        // Training stats HUD
        const thud = document.createElement('div');
        thud.id = 'nexus-train-hud';
        document.body.appendChild(thud);

        // Manual AI toggle button
        const btn = document.createElement('button');
        btn.id = 'nexus-btn';
        btn.innerHTML = '<span class="nexus-pulse-dot off"></span> ▶ NEXUS AI';
        btn.addEventListener('click', () => {
            if (training) return; // ignore if training
            active ? disable() : enable();
        });
        document.body.appendChild(btn);

        // AUTO TRAIN button — visible based on user setting
        const trainBtn = document.createElement('button');
        trainBtn.id = 'nexus-train-btn';
        trainBtn.innerHTML = '<span class="train-icon">▶</span> AUTO TRAIN';
        trainBtn.addEventListener('click', () => {
            training ? stopTraining() : startTraining();
        });
        document.body.appendChild(trainBtn);

        updateTrainButtonVisibility();
    }

    function updateTrainButtonVisibility() {
        const btn = document.getElementById('nexus-train-btn');
        if (!btn) return;
        btn.style.display = settings.aiTrainButtonVisible === false ? 'none' : 'block';
    }

    window.setNexusTrainButtonVisible = function(visible) {
        settings.aiTrainButtonVisible = visible !== false;
        updateTrainButtonVisibility();
        const toggle = document.getElementById('ai-train-visibility-toggle');
        if (toggle) {
            toggle.innerText = settings.aiTrainButtonVisible ? 'ON' : 'OFF';
            toggle.classList.toggle('on', settings.aiTrainButtonVisible);
        }
    };

    // ─────────────────────────────────────────────────────────────
    //  TRAINING HUD CLOCK — keep updating elapsed time & live stats
    // ─────────────────────────────────────────────────────────────
    setInterval(() => {
        if (training) updateTrainHUD();
        else if (active && ++ai.hudTick % 4 === 0) updateHUD();
    }, 500);

    const ready = () => {
        injectUI();
        document.addEventListener('keydown', e => {
            // Alt+A  → toggle manual AI
            if (e.altKey && e.key.toLowerCase() === 'a') {
                if (!training) active ? disable() : enable();
            }
            // Alt+T  → toggle auto-train
            if (e.altKey && e.key.toLowerCase() === 't') {
                training ? stopTraining() : startTraining();
            }
        });
        console.log('%c[NEXUS AI v3] Ready — click ▶ AUTO TRAIN or press Alt+T to begin autonomous training', 'color:#00ffcc;font-weight:bold');
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();

    return {
        enable, disable,
        startTraining, stopTraining,
        get on()       { return active; },
        get isTraining(){ return training; },
        get mem()      { return mem; },
        get history()  { return trainHistory; },
        resetMemory() {
            mem = {
                threatDeaths:{scout:0,sniper:0,bomber:0,tank:0,boss:0,runner:0},
                totalRuns:0, bestWave:0, dangerZones:[]
            };
            saveMem();
            trainHistory = [];
            updateTrainHUD();
        }
    };
})();

// ─────────────────────────────────────────────────────────────────
// NEXUS AI v3 — Autonomous Training System
// Controls:
//   ▶ AUTO TRAIN button (bottom-right)  → start / stop endless training
//   Alt+T                               → same keyboard shortcut
//   ▶ NEXUS AI button                   → manual co-pilot (single run)
//   Alt+A                               → same keyboard shortcut
// ─────────────────────────────────────────────────────────────────
