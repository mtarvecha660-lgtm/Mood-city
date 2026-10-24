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
        s += playerPickBias(name);
        s += Math.max(0, 80 - e.hp) * 0.4;

        // Heavily penalize enemies we can't see — prefer visible targets
        if (!hasLineOfSight(player.position, e.mesh.position)) s -= 800;
        if (ai.ignore && ai.ignore.e === e && performance.now() < ai.ignore.until) s -= 1500;

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
        // while escaping a wedge, the escape direction wins over whatever the phase wanted
        if (ai.escape && performance.now() < ai.escape.until) { wx = ai.escape.x; wz = ai.escape.z; }
        const sp  = (boosts && boosts.speed && Date.now() < boosts.speed)
                    ? playerSpeed * 1.8 : playerSpeed;
        const len = Math.sqrt(wx * wx + wz * wz) || 1;
        const mx  = (wx / len) * sp;
        const mz  = (wz / len) * sp;
        const ox = player.position.x, oz = player.position.z;

        player.position.x += mx;
        if (checkCollision(player.position, 0.7)) player.position.x -= mx;

        player.position.z += mz;
        if (checkCollision(player.position, 0.7)) player.position.z -= mz;

        // Head-on into a wall: slide along it instead of standing still
        if (Math.hypot(player.position.x - ox, player.position.z - oz) < sp * 0.3) {
            for (const side of [ai.slideSide || 1, -(ai.slideSide || 1)]) {
                const sx = -mz * side, sz = mx * side;
                player.position.x = ox + sx; player.position.z = oz + sz;
                if (!checkCollision(player.position, 0.7)) { ai.slideSide = side; return; }
            }
            player.position.x = ox; player.position.z = oz;
        }
    }

    // ─────────────────────────────────────────────────────────────
    //  STUCK DETECTION
    //  Old version only counted frames with < 0.02 movement, so jittering
    //  back and forth against a wall never counted as stuck, and its
    //  "nudge" was one single step. Now: if we've wanted to travel but
    //  made < 1.5 units of real progress in 2.5 s, we escape along a
    //  free direction for ~0.8 s, re-plan the route, and if the same
    //  hidden target keeps wedging us we drop it for a few seconds.
    // ─────────────────────────────────────────────────────────────
    function checkStuck(wantsTravel) {
        const now = performance.now();
        const p = player.position;
        ai.trail = ai.trail || [];
        if (!ai.trail.length || now - ai.trail[ai.trail.length - 1].t > 250) ai.trail.push({ t: now, x: p.x, z: p.z });
        while (ai.trail.length && now - ai.trail[0].t > 2600) ai.trail.shift();
        if (!wantsTravel) { ai.stuckTicks = 0; return; }
        if (ai.escape && now < ai.escape.until) return;
        const first = ai.trail[0];
        if (now - first.t < 2300) return;
        let far = 0;
        for (const s of ai.trail) far = Math.max(far, Math.hypot(p.x - s.x, p.z - s.z));
        if (far >= 1.5) return;

        ai.stuckTicks++;
        ai.unstucks = (ai.unstucks || 0) + 1;
        // escape: the free direction with the most open space, away from where we were pushing
        let best = null, bestScore = -1;
        for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2 + Math.random() * 0.3, dx = Math.cos(a), dz = Math.sin(a);
            let open = 0;
            for (let r = 1; r <= 6; r++) { if (blockedAt(p.x + dx * r, p.z + dz * r)) break; open = r; }
            const score = open + Math.random();
            if (score > bestScore) { bestScore = score; best = { x: dx, z: dz }; }
        }
        ai.escape = { x: best.x, z: best.z, until: now + 800 };
        ai.slideSide = -(ai.slideSide || 1);
        ai.strafeDir *= -1;
        nav.path = null;
        ai.trail = [];
        // the same target keeps wedging us → leave it for a bit and fight something reachable
        const tg = ai.navTarget;
        if (tg) {
            ai.wedge = (ai.wedge && ai.wedge.e === tg && now - ai.wedge.t < 20000) ? { e: tg, t: ai.wedge.t, n: ai.wedge.n + 1 } : { e: tg, t: now, n: 1 };
            if (ai.wedge.n >= 3) { ai.ignore = { e: tg, until: now + 8000 }; ai.wedge = null; log('ROUTE BLOCKED — switching target'); }
        }
        log('UNSTUCK — escape + re-route');
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
    //  NAVIGATION — grid A* around the buildings
    //  The old controller only ever walked in a straight line at its
    //  target and "strafed" when a building was in the way. The strafe
    //  flipped sides every 10–25 frames, so behind a wide building (or
    //  two buildings touching) it just jittered against the wall forever,
    //  staring at it, while the last hostile waited on the other side.
    //  Now it plans a real path around the buildings and follows it.
    // ─────────────────────────────────────────────────────────────
    const NAV = { cell: 1, half: 160, n: 320, grid: null, key: '', inflate: 1.05 };
    function navKey() {
        if (!buildings || !buildings.length) return 'none';
        const a = buildings[0], b = buildings[buildings.length - 1];
        return buildings.length + ':' + a.minX.toFixed(2) + ':' + a.minZ.toFixed(2) + ':' + b.minX.toFixed(2) + ':' + b.minZ.toFixed(2);
    }
    function navGrid() {
        const k = navKey();
        if (NAV.grid && NAV.key === k) return NAV.grid;
        const n = NAV.n, g = new Uint8Array(n * n), inf = NAV.inflate;
        for (const b of (buildings || [])) {
            const x0 = Math.max(0, Math.floor((b.minX - inf + NAV.half) / NAV.cell));
            const x1 = Math.min(n - 1, Math.floor((b.maxX + inf + NAV.half) / NAV.cell));
            const z0 = Math.max(0, Math.floor((b.minZ - inf + NAV.half) / NAV.cell));
            const z1 = Math.min(n - 1, Math.floor((b.maxZ + inf + NAV.half) / NAV.cell));
            for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
                const cx = (x + 0.5) * NAV.cell - NAV.half, cz = (z + 0.5) * NAV.cell - NAV.half;
                if (cx > b.minX - inf && cx < b.maxX + inf && cz > b.minZ - inf && cz < b.maxZ + inf) g[z * n + x] = 1;
            }
        }
        NAV.grid = g; NAV.key = k; nav.path = null;
        return g;
    }
    const toCell = v => Math.floor((v + NAV.half) / NAV.cell);
    const cellC  = i => (i + 0.5) * NAV.cell - NAV.half;
    function blockedCell(x, z) {
        if (x < 0 || z < 0 || x >= NAV.n || z >= NAV.n) return false;   // outside the city: open ground
        return NAV.grid[z * NAV.n + x] === 1;
    }
    function blockedAt(wx, wz) { navGrid(); return blockedCell(toCell(wx), toCell(wz)); }
    // nearest walkable cell to a world point (spiral search)
    function freeCellNear(wx, wz, maxR = 12) {
        const cx = toCell(wx), cz = toCell(wz);
        if (!blockedCell(cx, cz)) return [cx, cz];
        let best = null, bd = Infinity;
        for (let r = 1; r <= maxR && !best; r++) {
            for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                if (blockedCell(cx + dx, cz + dz)) continue;
                const d = dx * dx + dz * dz;
                if (d < bd) { bd = d; best = [cx + dx, cz + dz]; }
            }
        }
        return best;
    }
    // walkable straight segment? (sampled every half cell against the inflated grid)
    function segmentClear(ax, az, bx, bz) {
        navGrid();
        const d = Math.hypot(bx - ax, bz - az), steps = Math.max(1, Math.ceil(d / (NAV.cell * 0.4)));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (blockedAt(ax + (bx - ax) * t, az + (bz - az) * t)) return false;
        }
        return true;
    }
    function astar(sx, sz, gx, gz) {
        const g = navGrid(), n = NAV.n;
        const start = freeCellNear(sx, sz, 4), goal = freeCellNear(gx, gz, 14);
        if (!start || !goal) return null;
        const si = start[1] * n + start[0], gi = goal[1] * n + goal[0];
        if (si === gi) return [{ x: gx, z: gz }];
        const gScore = new Map(), came = new Map(), closed = new Set();
        const heap = [];                       // binary heap of [f, idx]
        const push = (f, i) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
        const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
        const h = i => { const dx = Math.abs(i % n - goal[0]), dz = Math.abs(((i / n) | 0) - goal[1]); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
        gScore.set(si, 0); push(h(si), si);
        let found = false, guard = 0;
        while (heap.length && guard++ < 60000) {
            const [, cur] = pop();
            if (cur === gi) { found = true; break; }
            if (closed.has(cur)) continue;
            closed.add(cur);
            const cx = cur % n, cz = (cur / n) | 0, gc = gScore.get(cur);
            for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dz) continue;
                const nx = cx + dx, nz = cz + dz;
                if (nx < 0 || nz < 0 || nx >= n || nz >= n || g[nz * n + nx]) continue;
                if (dx && dz && (g[cz * n + nx] || g[nz * n + cx])) continue;   // no corner cutting
                const ni = nz * n + nx, ng = gc + ((dx && dz) ? Math.SQRT2 : 1);
                if (ng < (gScore.has(ni) ? gScore.get(ni) : Infinity)) { gScore.set(ni, ng); came.set(ni, cur); push(ng + h(ni), ni); }
            }
        }
        if (!found) return null;
        const cells = [];
        for (let c = gi; c !== undefined && c !== si; c = came.get(c)) cells.push({ x: cellC(c % n), z: cellC((c / n) | 0) });
        cells.reverse();
        if (!blockedAt(gx, gz)) cells.push({ x: gx, z: gz });
        // string-pull: keep only the corners we actually need
        const out = []; let ax = sx, az = sz, i = 0;
        while (i < cells.length) {
            let j = cells.length - 1;
            while (j > i && !segmentClear(ax, az, cells[j].x, cells[j].z)) j--;
            out.push(cells[j]); ax = cells[j].x; az = cells[j].z; i = j + 1;
        }
        return out;
    }
    const nav = { path: null, goal: null, at: 0, fails: 0 };
    function resetNav() { nav.path = null; nav.goal = null; ai.escape = null; ai.trail = []; ai.ignore = null; ai.wedge = null; ai.navTarget = null; }
    // Direction to walk to reach (gx,gz) around buildings, or null if we can't plan one.
    function navDir(gx, gz) {
        const px = player.position.x, pz = player.position.z, now = performance.now();
        if (segmentClear(px, pz, gx, gz)) { nav.path = null; return { x: gx - px, z: gz - pz, direct: true }; }
        const moved = !nav.goal || Math.hypot(nav.goal.x - gx, nav.goal.z - gz) > 3;
        if (!nav.path || !nav.path.length || moved || now - nav.at > 1500) {
            nav.path = astar(px, pz, gx, gz); nav.goal = { x: gx, z: gz }; nav.at = now;
            if (!nav.path) { nav.fails++; return null; }
            nav.fails = 0;
        }
        // drop waypoints we've reached, and skip ahead when a later one is in clear view
        while (nav.path.length > 1 && (Math.hypot(nav.path[0].x - px, nav.path[0].z - pz) < 0.9 || segmentClear(px, pz, nav.path[1].x, nav.path[1].z))) nav.path.shift();
        const wp = nav.path[0];
        if (!wp) return null;
        if (Math.hypot(wp.x - px, wp.z - pz) < 0.5 && nav.path.length === 1) { nav.path = null; return { x: gx - px, z: gz - pz }; }
        return { x: wp.x - px, z: wp.z - pz, wp };
    }
    // Look where we're walking while the target is hidden (instead of staring at a wall)
    function lookAlong(d) {
        if (!d) return;
        const tYaw = Math.atan2(-d.x, -d.z);
        let dYaw = tYaw - yaw;
        while (dYaw >  Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        yaw += dYaw * 0.18;
        pitch += (0 - pitch) * 0.15;
    }
    // A free direction away from walls/enemies (used when kiting or evading so we don't back into a wall)
    function freeDir(wx, wz) {
        const len = Math.hypot(wx, wz) || 1, ux = wx / len, uz = wz / len;
        const px = player.position.x, pz = player.position.z;
        for (const a of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
            const c = Math.cos(a), s = Math.sin(a), dx = ux * c - uz * s, dz = ux * s + uz * c;
            if (segmentClear(px, pz, px + dx * 2.5, pz + dz * 2.5)) return { x: dx, z: dz };
        }
        return { x: ux, z: uz };
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

        // A far sniper we can see: back off and trade shots. One hiding behind a
        // building: go get it (backing away from it forever was a soft-lock).
        if (tgt && tgt.name === 'SNIPER' &&
            player.position.distanceTo(tgt.mesh.position) > 18 &&
            hasLineOfSight(player.position, tgt.mesh.position)) return 'KITE';

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
        ai.navTarget = tgt;

        const los = hasLineOfSight(player.position, tgt.mesh.position);
        const tp  = tgt.mesh.position;

        const d    = player.position.distanceTo(tp);
        const name = (tgt.name || '').toLowerCase();
        const pref = PREF[name] || 18;

        const dx = tp.x - player.position.x;
        const dz = tp.z - player.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const ux = dx / len, uz = dz / len;
        const sv = strafeVec(ux, uz);

        let wx, wz;
        if (!los) {
            // No line of sight — walk the planned route around the buildings,
            // looking where we're going, and re-acquire the target when it's in view.
            const nd = navDir(tp.x, tp.z);
            if (nd) {
                const l = Math.hypot(nd.x, nd.z) || 1;
                wx = nd.x / l; wz = nd.z / l;
                lookAlong(nd);
            } else {
                // no route (target sealed in) — keep one flank side instead of flip-flopping
                aimAt(tp);
                wx = ux * 0.4 + (-uz * ai.slideSide || -uz) * 1.0;
                wz = uz * 0.4 + ( ux * ai.slideSide ||  ux) * 1.0;
            }
        } else {
            aimAt(tp);
            if (d > pref + 2) {
                const nd = navDir(tp.x, tp.z) || { x: ux, z: uz };
                const l = Math.hypot(nd.x, nd.z) || 1;
                wx = (nd.x / l) * 0.85 + sv.x * 0.55;
                wz = (nd.z / l) * 0.85 + sv.z * 0.55;
            } else if (d < pref - 2) {
                const fd = freeDir(-ux, -uz);
                wx = fd.x * 0.85 + sv.x * 0.55;
                wz = fd.z * 0.85 + sv.z * 0.55;
            } else {
                wx = sv.x;
                wz = sv.z;
            }
            if (inDanger(player.position.x + wx * 2, player.position.z + wz * 2)) {
                wx = -wx; wz = -wz;
            }
        }

        moveWorld(wx, wz);

        // Only shoot when we actually have line of sight
        if (los && ammo > 0 && !isReloading) shoot();
        else if (ammo === 0 && reserve === 0) {
            // Completely out of ammo and no drop yet — kite away from enemies
            const fd = freeDir(player.position.x - tp.x, player.position.z - tp.z);
            moveWorld(fd.x, fd.z);
        }
        considerRocket(tgt);
    }

    function doKite(tgt) {
        if (!tgt) { doIdle(null); return; }
        ai.navTarget = null;

        aimAt(tgt.mesh.position);

        const dx  = tgt.mesh.position.x - player.position.x;
        const dz  = tgt.mesh.position.z - player.position.z;
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const ux = dx / len, uz = dz / len;
        const sv = strafeVec(ux, uz);

        const fd = freeDir(-ux * 0.6 + sv.x * 0.8, -uz * 0.6 + sv.z * 0.8);
        moveWorld(fd.x, fd.z);

        if (hasLineOfSight(player.position, tgt.mesh.position) && ammo > 0 && !isReloading) shoot();
    }

    function doSeekDrop(dp, tgt) {
        if (!dp || !dp.mesh) { ai.phase = 'HUNT'; return; }
        ai.navTarget = null;

        const dx   = dp.mesh.position.x - player.position.x;
        const dz   = dp.mesh.position.z - player.position.z;
        const dist = Math.sqrt(dx*dx + dz*dz);

        if (dist < 1.8) {
            ai.phase = 'HUNT';
            log(`COLLECTED ${dp.type.toUpperCase()}`);
            return;
        }

        const nd = navDir(dp.mesh.position.x, dp.mesh.position.z) || { x: dx, z: dz };

        if (tgt && hasLineOfSight(player.position, tgt.mesh.position)) {
            aimAt(tgt.mesh.position);
            if (player.position.distanceTo(tgt.mesh.position) < 35 && ammo > 0 && !isReloading) shoot();
        } else if (nd.direct) {
            aimAt(dp.mesh.position);
        } else {
            lookAlong(nd);
        }

        moveWorld(nd.x, nd.z);
    }

    function doEvadeBomber(bomber, tgt) {
        if (!bomber || !bomber.mesh) { ai.phase = 'HUNT'; return; }
        ai.navTarget = null;

        aimAt(bomber.mesh.position);
        if (hasLineOfSight(player.position, bomber.mesh.position) && ammo > 0 && !isReloading) shoot();

        const fd = freeDir(player.position.x - bomber.mesh.position.x, player.position.z - bomber.mesh.position.z);
        moveWorld(fd.x, fd.z);
    }

    // ─────────────────────────────────────────────────────────────
    //  MAIN FRAME HOOK
    // ─────────────────────────────────────────────────────────────
    function frame() {
        if (!active) return;
        rafId = requestAnimationFrame(frame);

        if (!gameRunning || gamePaused || !player || hp <= 0) return;
        aiAssistedRun = true;   // the AI touched this run: it earns no XP / high score

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

        // Travelling phases are the ones that can get wedged (HUNT while the target is hidden or far)
        const wantsTravel = ai.phase === 'SEEK_DROP' || ai.phase === 'KITE' || ai.phase === 'EVADE_BOMBER' ||
            (ai.phase === 'HUNT' && tgt && (!hasLineOfSight(player.position, tgt.mesh.position) ||
                player.position.distanceTo(tgt.mesh.position) > (PREF[(tgt.name || '').toLowerCase()] || 18) + 6));
        checkStuck(wantsTravel);

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
                        if (typeof Juice !== 'undefined') Juice.onPause(false);
                        if (typeof animate === 'function') animate();   // the loop stops while paused; restart it
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
        ai.stuckTicks = 0; resetNav();
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

            // AI practice runs never touch the player's high score, XP or unlocks.
            aiAssistedRun = true;

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
        if (typeof Coop !== 'undefined' && Coop.active) return;   // no AI practice in co-op
        training      = true;
        aiAssistedRun = true;
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
            ai.stuckTicks = 0; resetNav();
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
        if (typeof Coop !== 'undefined' && Coop.active) return;   // AI can't play in co-op
        if (active || training) return;
        active = true;
        ai.lastHp    = hp || 100;
        ai.phase     = 'IDLE';
        ai.lastPos   = null;
        ai.stuckTicks = 0; resetNav();
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
        if (document.getElementById('nexus-hud')) return;

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

        // The two old floating buttons (NEXUS AI / AUTO TRAIN) are replaced by one
        // AI button + menu (AIMenu, bottom of this file).
        updateTrainButtonVisibility();
    }

    function updateTrainButtonVisibility() {
        const btn = document.getElementById('ai-btn');
        if (!btn) return;
        btn.classList.toggle('hidden-by-setting', !settings.aiFeatures);
        const pb = document.getElementById('pause-ai-btn');
        if (pb) pb.style.display = settings.aiFeatures ? '' : 'none';
    }

    window.setNexusTrainButtonVisible = function(visible) {
        settings.aiFeatures = visible !== false;
        if (!settings.aiFeatures) {          // turning AI off also stops anything it is doing
            if (training) { stopTraining(); if (typeof exitToMenu === 'function') exitToMenu(); }
            else if (active) disable();
            if (typeof AIMenu !== 'undefined') AIMenu.close(true);
        }
        updateTrainButtonVisibility();
        if (typeof AIMenu !== 'undefined') AIMenu.render();
        const toggle = document.getElementById('ai-train-visibility-toggle');
        if (toggle) {
            toggle.innerText = settings.aiFeatures ? 'ON' : 'OFF';
            toggle.classList.toggle('on', settings.aiFeatures);
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
            if (!settings.aiFeatures) return;   // AI features off: shortcuts do nothing
            if (e.altKey && e.key.toLowerCase() === 'a') {
                if (!training) active ? disable() : enable();
            }
            // Alt+T  → toggle auto-train
            if (e.altKey && e.key.toLowerCase() === 't') {
                training ? stopTraining() : startTraining();
            }
        });
        
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
    else ready();


    // ─────────────────────────────────────────────────────────────
    //  LEARN FROM MY PLAY (opt-in): while YOU play, the AI records what hurts
    //  you (threat weights), where you get hit (danger zones) and which enemy
    //  types you go for (target priorities). The co-pilot and practice mode use
    //  the same memory, so it starts playing more like you.
    // ─────────────────────────────────────────────────────────────
    mem.playerPicks  = mem.playerPicks  || {};
    mem.learnedHits  = mem.learnedHits  || 0;
    mem.learnedKills = mem.learnedKills || 0;
    mem.learnedRuns  = mem.learnedRuns  || 0;
    let learnFromMe = (() => { try { return localStorage.getItem('nexus_learn_mine') === '1'; } catch { return false; } })();
    let humanLastHp = null, humanWasRunning = false;

    function playerPickBias(name) {
        const tot = mem.learnedKills || 0;
        if (tot < 5) return 0;
        return ((mem.playerPicks[name] || 0) / tot) * 160;
    }
    function humanPlaying() {
        return typeof gameRunning !== 'undefined' && gameRunning && !gamePaused && !active && !training && !tutorialMode;
    }
    function nearestEnemyName() {
        if (!player || !enemies || !enemies.length) return null;
        let best = null, bd = Infinity;
        for (const e of enemies) { const d = player.position.distanceTo(e.mesh.position); if (d < bd) { bd = d; best = e; } }
        return best ? (best.name || '').toLowerCase() : null;
    }
    setInterval(() => {
        const running = typeof gameRunning !== 'undefined' && gameRunning && !active && !training && !tutorialMode;
        if (learnFromMe && humanWasRunning && !running && typeof hp !== 'undefined' && hp <= 0) { mem.learnedRuns++; saveMem(); }
        humanWasRunning = running;
        if (!learnFromMe || !humanPlaying()) { humanLastHp = null; return; }
        if (humanLastHp !== null && hp < humanLastHp - 1) {
            markDanger(player.position);
            const n = nearestEnemyName();
            if (n) mem.threatDeaths[n] = (mem.threatDeaths[n] || 0) + 0.15;
            mem.learnedHits++;
            saveMem();
        }
        humanLastHp = hp;
    }, 250);
    function hookKills() {
        if (typeof Juice === 'undefined' || Juice._nexusHooked) return;
        const orig = Juice.onKill;
        Juice.onKill = function(e) {
            try {
                if (learnFromMe && !active && !training && !tutorialMode && e) {
                    const n = (e.name || '').toLowerCase();
                    mem.playerPicks[n] = (mem.playerPicks[n] || 0) + 1;
                    mem.learnedKills++;
                    if (mem.learnedKills % 5 === 0) saveMem();
                }
            } catch (err) {}
            return orig.apply(this, arguments);
        };
        Juice._nexusHooked = true;
    }
    hookKills();
    function setLearnFromMe(v) {
        learnFromMe = !!v;
        try { localStorage.setItem('nexus_learn_mine', learnFromMe ? '1' : '0'); } catch {}
        saveMem();
    }

    return {
        enable, disable,
        startTraining, stopTraining,
        get on()       { return active; },
        _dbg() { return { unstucks: ai.unstucks || 0, path: nav.path ? nav.path.length : 0 }; },
        get isTraining(){ return training; },
        get mem()      { return mem; },
        get history()  { return trainHistory; },
        get learnFromMe() { return learnFromMe; },
        setLearnFromMe,
        get phase()    { return ai.phase; },
        get runs()     { return trainRunCount; },
        resetMemory() {
            mem = {
                threatDeaths:{scout:0,sniper:0,bomber:0,tank:0,boss:0,runner:0},
                totalRuns:0, bestWave:0, dangerZones:[],
                playerPicks:{}, learnedHits:0, learnedKills:0, learnedRuns:0
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


// ─────────────────────────────────────────────────────────────────
// AI MENU — one button, one compact panel, three plain options.
//   1. AI plays for me      → NEXUS co-pilot takes over your run (was "NEXUS AI")
//   2. Learn from my play   → your runs teach the AI (new, opt-in)
//   3. AI practice mode     → AI plays endless runs alone to learn (was "AUTO TRAIN")
// While the AI is driving, a small chip shows what it is doing; tap it to stop.
// ─────────────────────────────────────────────────────────────────
const AIMenu = (() => {
    const $ = id => document.getElementById(id);
    let pausedByMenu = false;
    const click = () => { if (typeof Sound !== 'undefined' && Sound.uiClick) Sound.uiClick(); };

    function topThreat(mem) {
        let best = null, v = 0.5;
        for (const k in mem.threatDeaths) if (mem.threatDeaths[k] > v) { v = mem.threatDeaths[k]; best = k; }
        return best;
    }
    function favPick(mem) {
        let best = null, v = 0;
        for (const k in (mem.playerPicks || {})) if (mem.playerPicks[k] > v) { v = mem.playerPicks[k]; best = k; }
        return best;
    }

    function build() {
        if ($('ai-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'ai-btn';
        btn.setAttribute('aria-label', 'AI options');
        btn.innerHTML = '<span class="ai-ico">🤖</span><span class="ai-lbl">AI</span>';
        btn.addEventListener('click', e => { e.stopPropagation(); click(); open(); });
        document.body.appendChild(btn);

        const chip = document.createElement('button');
        chip.id = 'ai-chip';
        chip.addEventListener('click', e => { e.stopPropagation(); click(); stopAll(); });
        document.body.appendChild(chip);

        const panel = document.createElement('div');
        panel.id = 'ai-panel';
        panel.innerHTML = `
          <div class="ai-card" role="dialog" aria-label="AI options">
            <div class="ai-head"><span>🤖 AI</span><button class="ai-x" id="ai-close" aria-label="Close">✕</button></div>
            <div class="ai-row">
              <div class="ai-txt"><b>AI plays for me</b><span>Takes over your run: aims, moves and shoots for you. Turn off to take back control.</span></div>
              <button class="ai-tog" id="ai-opt-copilot"></button>
            </div>
            <div class="ai-row">
              <div class="ai-txt"><b>Learn from my play</b><span>While you play, it watches what hurts you, where you get hit and which enemies you go for first, and copies that.</span></div>
              <button class="ai-tog" id="ai-opt-learn"></button>
            </div>
            <div class="ai-row">
              <div class="ai-txt"><b>AI practice mode</b><span>The AI plays non-stop runs on its own to learn which enemies kill it. Watch it, or stop any time.</span></div>
              <button class="ai-tog" id="ai-opt-practice"></button>
            </div>
            <div class="ai-foot"><span id="ai-mem"></span><button class="ai-reset" id="ai-reset">RESET MEMORY</button></div>
          </div>`;
        panel.addEventListener('click', e => { if (e.target === panel) close(); });
        document.body.appendChild(panel);

        $('ai-close').addEventListener('click', e => { e.stopPropagation(); click(); close(); });
        $('ai-opt-copilot').addEventListener('click', e => {
            e.stopPropagation(); click();
            if (NEXUS.isTraining) NEXUS.stopTraining();
            if (NEXUS.on) NEXUS.disable(); else NEXUS.enable();
            render();
            if (NEXUS.on) {
                close(true);
                // turning the AI on from the pause menu jumps straight back into the run
                if (typeof gameRunning !== 'undefined' && gameRunning && gamePaused && typeof resumeGame === 'function') resumeGame();
            }
        });
        $('ai-opt-learn').addEventListener('click', e => {
            e.stopPropagation(); click();
            NEXUS.setLearnFromMe(!NEXUS.learnFromMe);
            render();
        });
        $('ai-opt-practice').addEventListener('click', e => {
            e.stopPropagation(); click();
            if (NEXUS.isTraining) { NEXUS.stopTraining(); render(); return; }
            if (NEXUS.on) NEXUS.disable();
            pausedByMenu = false;
            if (typeof gamePaused !== 'undefined' && gamePaused && gameRunning) { gamePaused = false; const pm = $('pause-menu'); if (pm) pm.style.display = 'none'; }
            close(true);
            NEXUS.startTraining();
            render();
        });
        $('ai-reset').addEventListener('click', e => {
            e.stopPropagation(); click();
            if (confirm('Reset everything the AI has learned?')) { NEXUS.resetMemory(); render(); }
        });
        setInterval(renderChip, 500);
        const menuEl = $('menu');
        if (menuEl && window.MutationObserver) new MutationObserver(renderChip).observe(menuEl, { attributes: true, attributeFilter: ['style'] });
        render();
    }

    function render() {
        const set = (id, on, onTxt, offTxt) => { const b = $(id); if (!b) return; b.classList.toggle('on', !!on); b.textContent = on ? onTxt : offTxt; };
        set('ai-opt-copilot', NEXUS.on && !NEXUS.isTraining, 'ON', 'OFF');
        set('ai-opt-learn', NEXUS.learnFromMe, 'ON', 'OFF');
        set('ai-opt-practice', NEXUS.isTraining, 'STOP', 'START');
        const m = NEXUS.mem, el = $('ai-mem');
        if (el && m) {
            const parts = [];
            parts.push(`${m.learnedRuns || 0} of your runs, ${m.totalRuns || 0} practice runs`);
            if (m.bestWave) parts.push(`AI best: wave ${m.bestWave}`);
            const t = topThreat(m); if (t) parts.push(`fears: ${t}`);
            const f = favPick(m); if (f && (m.learnedKills || 0) >= 5) parts.push(`you hunt: ${f}`);
            el.textContent = 'Learned from ' + parts.join(' · ');
        }
        const btn = $('ai-btn'); if (btn) btn.classList.toggle('on', NEXUS.on || NEXUS.isTraining);
        renderChip();
    }

    function renderChip() {
        const btn = $('ai-btn');
        if (btn) { const menu = $('menu'); btn.style.display = (settings.aiFeatures && menu && menu.style.display !== 'none' && getComputedStyle(menu).display !== 'none') ? '' : 'none'; }
        const pb = $('pause-ai-btn'); if (pb) pb.style.display = settings.aiFeatures ? '' : 'none';
        const chip = $('ai-chip'); if (!chip) return;
        const running = typeof gameRunning !== 'undefined' && gameRunning;
        if (NEXUS.isTraining) {
            const h = NEXUS.history || [], last = h[h.length - 1];
            chip.innerHTML = `<span class="dot"></span>AI PRACTICING · RUN ${NEXUS.runs + 1}${NEXUS.mem.bestWave ? ' · BEST W' + NEXUS.mem.bestWave : ''}${last ? ' · ' + last.acc + '% ACC' : ''} <b>■ STOP</b>`;
            chip.style.display = 'flex';
        } else if (NEXUS.on && running) {
            chip.innerHTML = `<span class="dot"></span>AI PLAYING · ${String(NEXUS.phase || '').toUpperCase()} <b>■ STOP</b>`;
            chip.style.display = 'flex';
        } else chip.style.display = 'none';
    }

    function stopAll() {
        if (NEXUS.isTraining) {
            NEXUS.stopTraining();
            if (typeof exitToMenu === 'function') exitToMenu();
        } else if (NEXUS.on) NEXUS.disable();
        render();
    }

    function open() {
        if (!settings.aiFeatures) return;
        if (typeof Coop !== 'undefined' && Coop.active) { if (typeof showFloatingFeedback === 'function') showFloatingFeedback('AI IS OFF IN CO-OP', 'warn'); return; }
        if (typeof gameRunning !== 'undefined' && gameRunning && !gamePaused && !NEXUS.isTraining) {
            gamePaused = true; pausedByMenu = true;
            if (typeof Juice !== 'undefined') Juice.onPause(true);
            if (document.pointerLockElement) document.exitPointerLock();
        }
        const pm = $('pause-menu'); if (pm && pm.style.display === 'flex') pm.classList.add('under-ai');
        render();
        $('ai-panel').classList.add('show');
    }
    function close(skipResume) {
        $('ai-panel').classList.remove('show');
        const pm = $('pause-menu'); if (pm) pm.classList.remove('under-ai');
        if (pausedByMenu && !skipResume && typeof resumeGame === 'function') { pausedByMenu = false; resumeGame(); }
        pausedByMenu = false;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
    return { open, close, render };
})();
