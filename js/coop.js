// ── js/coop.js ──
// Room-code CO-OP for 2–4 players, peer-to-peer over WebRTC (PeerJS and its free
// public broker; no server of ours). Host-authoritative: the host simulates the
// enemies, waves, drops and the shared wave bonus. Every player owns their own
// movement, aim, ammo and HP, sends hits on the host's enemies (the host applies
// them and credits the kill), and is revived by a teammate standing next to them.
// Single-player never runs any of this: every hook in game.js checks Coop.active.

window.Coop = (() => {
    const PEER_CDN = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    const PREFIX = 'moodshiftcity-coop-';
    const MAX = 4;
    const SNAP_MS = 66, STATE_MS = 50, INTERP_MS = 110, TIMEOUT_MS = 9000;
    const REVIVE_MS = 3000, REVIVE_R = 2.8;
    const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';           // no I / L / O
    const SPAWN = [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6]];
    const OPC = { striker: '#7cc3d6', enforcer: '#c6a2f0', phantom: '#ffc857', medic: '#7fd6a4' };
    const $ = id => document.getElementById(id);
    const r2 = v => Math.round(v * 100) / 100;

    let peer = null, role = null, hostConn = null;
    let inRoom = false, active = false, running = false;
    let code = '', mySlot = 0, seed = 1, lastHostMsg = 0, connectTimer = null;
    let netTimer = null, lastSnap = 0, lastState = 0, lastHud = 0, lastFrame = 0, wipeAt = 0;
    let downed = false, spawnAt = null, enemySeq = 0, dropSeq = 0, applyingSlot = null;
    const conns = new Map();        // host: peerId -> { conn, slot }
    const players = new Map();      // slot -> player record (everyone, including me)
    const enemyById = new Map();
    const pickedIds = new Set();
    let pendingHits = [];
    let tracers = [];

    function myName() {
        let n = (localStorage.getItem('msc_name') || '').trim();
        if (!n) { n = 'PLAYER' + Math.floor(10 + Math.random() * 90); localStorage.setItem('msc_name', n); }
        return n.slice(0, 12);
    }
    function isHost() { return active && role === 'host'; }
    function isClient() { return active && role === 'client'; }

    // ───────────────────────── players ─────────────────────────
    function ensurePlayer(slot, name, char) {
        let p = players.get(slot);
        if (!p) {
            p = { slot, name: name || 'PLAYER', char: char || 'striker', x: 0, y: 1.8, z: 0, yaw: 0, pitch: 0,
                  hp: 100, mhp: 100, down: false, rev: 0, score: 0, buf: [], last: performance.now(),
                  vec: new THREE.Vector3(), avatar: null, tag: null, tagKey: '' };
            players.set(slot, p);
        }
        if (name) p.name = name;
        if (char) p.char = char;
        return p;
    }
    function removePlayer(slot) {
        const p = players.get(slot); if (!p) return;
        dropAvatar(p);
        players.delete(slot);
    }
    function rosterList() {
        return [...players.values()].sort((a, b) => a.slot - b.slot).map(p => ({ s: p.slot, n: p.name, c: p.char }));
    }
    function pushSample(p, x, y, z, yaw, pitch) {
        const now = performance.now();
        p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch; p.last = now;
        p.buf.push({ t: now, x, y, z, r: yaw });
        if (p.buf.length > 30) p.buf.shift();
    }
    function lerpAngle(a, b, k) {
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return a + d * k;
    }
    // Interpolate a sample buffer at time t (render a little in the past so motion is smooth)
    function sample(buf, t) {
        if (!buf.length) return null;
        while (buf.length > 2 && buf[1].t <= t) buf.shift();
        const a = buf[0], b = buf[1];
        if (!b || t <= a.t) return a;
        const k = Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, r: lerpAngle(a.r, b.r, k) };
    }

    // ───────────────────────── networking ─────────────────────────
    function loadPeer() {
        if (window.Peer) return Promise.resolve();
        return new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = PEER_CDN; s.async = true;
            s.onload = () => res(); s.onerror = () => rej(new Error('could not load the co-op library'));
            document.head.appendChild(s);
        });
    }
    function send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch (e) {} }
    function broadcast(msg, exceptSlot) {
        for (const c of conns.values()) if (c.slot !== exceptSlot) send(c.conn, msg);
    }
    function connOf(slot) { for (const c of conns.values()) if (c.slot === slot) return c.conn; return null; }
    function newCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return s; }

    async function host() {
        if (peer) return;
        status('Opening a room…');
        try { await loadPeer(); } catch (e) { status('Couldn\'t load co-op. Check your connection.', true); return; }
        role = 'host'; mySlot = 0;
        players.clear();
        ensurePlayer(0, myName(), selectedChar);
        const tryOpen = (attempt) => {
            code = newCode();
            peer = new Peer(PREFIX + code, { debug: 0 });
            peer.on('open', () => {
                inRoom = true; status('');
                showPane('room'); renderRoom();
                startNet();
            });
            peer.on('connection', conn => onHostConn(conn));
            peer.on('disconnected', () => { if (peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
            peer.on('error', err => {
                if (err && err.type === 'unavailable-id' && attempt < 4) { try { peer.destroy(); } catch (e) {} peer = null; tryOpen(attempt + 1); return; }
                if (!inRoom) { status('Couldn\'t open a room (' + (err && err.type || 'network') + '). Try again.', true); resetNet(); }
            });
        };
        tryOpen(0);
    }
    function onHostConn(conn) {
        conn.on('data', d => hostRecv(conn, d));
        conn.on('close', () => dropConn(conn));
        conn.on('error', () => dropConn(conn));
    }
    function freeSlot() { for (let s = 1; s < MAX; s++) if (!players.has(s)) return s; return -1; }
    function hostRecv(conn, m) {
        if (!m || typeof m !== 'object') return;
        const c = conns.get(conn.peer);
        if (m.t === 'hello') {
            if (c) return;
            const slot = freeSlot();
            if (slot < 0) { send(conn, { t: 'full' }); setTimeout(() => { try { conn.close(); } catch (e) {} }, 300); return; }
            conns.set(conn.peer, { conn, slot });
            const p = ensurePlayer(slot, String(m.n || 'PLAYER').slice(0, 12), OPC[m.c] ? m.c : 'striker');
            p.down = false; p.rev = 0; p.buf = []; p.last = performance.now();
            const hp0 = players.get(0);
            send(conn, { t: 'welcome', slot, code, roster: rosterList(), running, seed, diff: difficultyMode,
                         at: running && hp0 ? [r2(hp0.x), r2(hp0.z)] : null });
            if (running) send(conn, { t: 'wave', n: wave, b: isBossWave, m: currentWaveModifier, late: true });
            broadcast({ t: 'roster', r: rosterList() });
            renderRoom();
            if (running) announce(p.name + ' JOINED');
            return;
        }
        if (!c) return;
        const p = players.get(c.slot); if (!p) return;
        p.last = performance.now();
        switch (m.t) {
            case 'st': {
                const s = m.s;
                pushSample(p, s[0], s[1], s[2], s[3], s[4]);
                p.hp = s[5]; p.mhp = s[6]; p.score = s[8];
                const wasDown = p.down; p.down = !!s[7];
                if (p.down && !wasDown) { p.rev = 0; announce(p.name + ' IS DOWN', 'revive them: stand close for 3 s'); }
                break;
            }
            case 'hit': if (running) applyRemoteHits(c.slot, m.h); break;
            case 'pick': {
                const i = drops.findIndex(d => d.id === m.id);
                if (i >= 0) { disposeMesh(drops[i].mesh); drops.splice(i, 1); }
                break;
            }
            case 'shot': broadcast({ t: 'shot', s: c.slot, o: m.o, d: m.d, h: m.h }, c.slot); remoteShot(c.slot, m.o, m.d, m.h); break;
            case 'bye': dropConn(conn); break;
        }
    }
    function dropConn(conn) {
        const c = conns.get(conn.peer); if (!c) return;
        conns.delete(conn.peer);
        try { conn.close(); } catch (e) {}
        const p = players.get(c.slot);
        const name = p ? p.name : 'PLAYER';
        removePlayer(c.slot);
        broadcast({ t: 'left', s: c.slot, n: name });
        broadcast({ t: 'roster', r: rosterList() });
        renderRoom();
        if (running) announce(name + ' LEFT');
    }

    async function join(rawCode) {
        if (peer) return;
        const want = String(rawCode || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
        if (want.length < 4) { status('Type the 4-letter room code.', true); return; }
        status('Joining room ' + want + '…');
        try { await loadPeer(); } catch (e) { status('Couldn\'t load co-op. Check your connection.', true); return; }
        role = 'client'; code = want;
        players.clear();
        peer = new Peer({ debug: 0 });
        peer.on('open', () => {
            hostConn = peer.connect(PREFIX + want, { reliable: true, serialization: 'json' });
            hostConn.on('open', () => { lastHostMsg = performance.now(); send(hostConn, { t: 'hello', n: myName(), c: selectedChar }); });
            hostConn.on('data', clientRecv);
            hostConn.on('close', hostLeft);
            hostConn.on('error', hostLeft);
        });
        peer.on('error', err => {
            if (err && err.type === 'peer-unavailable') { status('No room called ' + want + '. Check the code with your friend.', true); resetNet(); return; }
            if (!inRoom) { status('Couldn\'t connect (' + (err && err.type || 'network') + '). Try again.', true); resetNet(); }
        });
        clearTimeout(connectTimer);
        connectTimer = setTimeout(() => {
            if (!inRoom && role === 'client') { status('Couldn\'t reach room ' + want + '. Some networks block peer-to-peer; try Wi-Fi or mobile data.', true); resetNet(); }
        }, 15000);
    }
    function clientRecv(m) {
        if (!m || typeof m !== 'object') return;
        lastHostMsg = performance.now();
        switch (m.t) {
            case 'welcome':
                clearTimeout(connectTimer);
                inRoom = true; mySlot = m.slot; code = m.code || code;
                applyRoster(m.roster);
                spawnAt = m.at;
                status(''); showPane('room'); renderRoom();
                startNet();
                if (m.running) beginRun(m.seed, m.diff);
                break;
            case 'full': status('That room is full (4 players max).', true); resetNet(); break;
            case 'roster': applyRoster(m.r); renderRoom(); break;
            case 'start': spawnAt = null; beginRun(m.seed, m.diff); break;
            case 'snap': if (running) applySnap(m); break;
            case 'eb': if (running) spawnEnemyBullet(m); break;
            case 'gone': if (running) clientGone(m); break;
            case 'wave': if (running) clientWave(m); break;
            case 'cleared': if (running && gameRunning) Juice.onWaveCleared(); break;
            case 'dmg': if (running) localHurt(m.a); break;
            case 'revive': if (running) localRevive(); break;
            case 'revived': if (running) announceRevive(m.s, m.by); break;
            case 'over': squadWiped(); break;
            case 'shot': if (running) remoteShot(m.s, m.o, m.d, m.h); break;
            case 'left': {
                const p = players.get(m.s);
                removePlayer(m.s);
                if (running) announce((m.n || (p && p.name) || 'PLAYER') + ' LEFT');
                break;
            }
            case 'bye': hostLeft(); break;
        }
    }
    function applyRoster(list) {
        const keep = new Set();
        (list || []).forEach(r => { keep.add(r.s); ensurePlayer(r.s, r.n, r.c); });
        [...players.keys()].forEach(s => { if (!keep.has(s)) removePlayer(s); });
    }

    function startNet() {
        clearInterval(netTimer);
        netTimer = setInterval(netTick, 33);
    }
    function netTick() {
        const now = performance.now();
        if (role === 'host') {
            for (const c of [...conns.values()]) {
                const p = players.get(c.slot);
                if (p && now - p.last > TIMEOUT_MS) dropConn(c.conn);
            }
            if (running && now - lastSnap >= SNAP_MS) { lastSnap = now; broadcast(buildSnap()); }
        } else if (role === 'client' && inRoom) {
            if (now - lastHostMsg > TIMEOUT_MS) { hostLeft(); return; }
            if (running && now - lastState >= STATE_MS) { lastState = now; sendState(); }
        }
        if (running) flushHits();
    }
    function sendState() {
        if (!player) return;
        send(hostConn, { t: 'st', s: [r2(player.position.x), r2(player.position.y), r2(player.position.z), r2(yaw), r2(pitch),
            Math.max(0, Math.ceil(hp)), playerMaxHp, downed ? 1 : 0, score] });
    }
    function buildSnap() {
        const me = players.get(0);
        if (me && player) {
            pushSample(me, player.position.x, player.position.y, player.position.z, yaw, pitch);
            me.hp = Math.max(0, Math.ceil(hp)); me.mhp = playerMaxHp; me.down = downed; me.score = score;
        }
        const v = new THREE.Vector3();
        return {
            t: 'snap', w: wave, ts: enemiesToSpawn,
            e: enemies.filter(e => e.id).map(e => {
                e.mesh.getWorldDirection(v);
                return [e.id, e.isBoss ? 'boss' : e.name, r2(e.mesh.position.x), r2(e.mesh.position.y), r2(e.mesh.position.z),
                        r2(Math.atan2(v.x, v.z)), Math.ceil(e.hp), Math.ceil(e.maxHp || e.hp), e.size, e.bossPhase || 0, e.hitFlash > 0.5 ? 1 : 0];
            }),
            d: drops.map(d => { if (!d.id) d.id = ++dropSeq; return [d.id, d.type, d.powerup || '', r2(d.mesh.position.x), r2(d.mesh.position.z)]; }),
            p: [...players.values()].map(p => [p.slot, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), Math.ceil(p.hp), p.mhp, p.down ? 1 : 0, Math.round(p.rev / REVIVE_MS * 100), p.score])
        };
    }

    // ───────────────────────── host: enemies & combat ─────────────────────────
    function nPlayers() { return Math.max(1, players.size); }
    function scaleCount(count) { return Math.round(count * (1 + 0.5 * (nPlayers() - 1))); }
    function onSpawn(e) {
        if (!isHost()) return;
        const k = e.isBoss ? 1 + 0.6 * (nPlayers() - 1) : 1 + 0.35 * (nPlayers() - 1);
        const v = e.hp * k;
        delete e.hp;
        e.id = ++enemySeq;
        e._hp = v; e.maxHp = (e.maxHp ? e.maxHp * k : v); e._by = mySlot;
        Object.defineProperty(e, 'hp', {
            configurable: true, enumerable: true,
            get() { return this._hp; },
            set(nv) { if (nv < this._hp) this._by = applyingSlot === null ? mySlot : applyingSlot; this._hp = nv; }
        });
        enemyById.set(e.id, e);
    }
    function applyRemoteHits(slot, hits) {
        if (!Array.isArray(hits)) return;
        const p = players.get(slot);
        for (const h of hits) {
            const e = enemyById.get(h[0]);
            if (!e || !(e._hp > 0) || !enemies.includes(e)) continue;
            applyingSlot = slot;
            e.hp -= Math.max(0, Math.min(5000, +h[1] || 0));
            applyingSlot = null;
            e.hitFlash = 1.0;
            e._meleeKill = !!(h[2] & 1); e._headKill = !!(h[2] & 2);
            if ((h[2] & 1) && p) {
                const push = new THREE.Vector3(e.mesh.position.x - p.x, 0, e.mesh.position.z - p.z);
                if (push.lengthSq() > 0.0001) e.knock = push.normalize().multiplyScalar(e.isBoss ? 0.25 : 0.7);
            }
        }
    }
    function standing(p) { return !p.down && p.hp > 0; }
    function target(e) {
        let best = null, bestD = Infinity;
        const ep = e.mesh.position;
        if (!downed && hp > 0) { best = { pos: player.position, remote: false, slot: mySlot }; bestD = ep.distanceToSquared(player.position); }
        const now = performance.now();
        for (const p of players.values()) {
            if (p.slot === mySlot || !standing(p) || now - p.last > 4000) continue;
            p.vec.set(p.x, p.y, p.z);
            const d = ep.distanceToSquared(p.vec);
            if (d < bestD) { bestD = d; best = { pos: p.vec, remote: true, slot: p.slot }; }
        }
        return best || { pos: player.position, remote: false, slot: mySlot };
    }
    function spawnAnchor() {
        const pts = [];
        if (!downed && hp > 0) pts.push(player.position);
        for (const p of players.values()) if (p.slot !== mySlot && standing(p)) pts.push({ x: p.x, z: p.z });
        return pts.length ? pts[(Math.random() * pts.length) | 0] : player.position;
    }
    function hurtRemote(tg, dmg) { send(connOf(tg.slot), { t: 'dmg', a: dmg }); }
    function killedByMe(e) { return (e._by === undefined ? mySlot : e._by) === mySlot; }
    function killerName(e) { const p = players.get(e._by); return p ? esc(p.name) : 'TEAM'; }
    function otherKill(e) {
        const p = e.mesh.position.clone();
        Toon.burst(p, 'enemy', e.isBoss ? 120 : 24, e.isBoss ? 2 : 1);
        Toon.ringPop(p, e.isBoss ? 3 : (e.size || 1), 0xfff4e2);
        return e.isBoss ? 500 * wave : 50;
    }
    function enemyGone(e, fx) {
        enemyById.delete(e.id);
        broadcast({ t: 'gone', id: e.id, fx, k: fx === 'kill' ? (e._by === undefined ? mySlot : e._by) : -1,
                    f: (e._meleeKill ? 1 : 0) | (e._headKill ? 2 : 0) });
    }
    function ebSpawn(b, big) {
        broadcast({ t: 'eb', p: [r2(b.mesh.position.x), r2(b.mesh.position.y), r2(b.mesh.position.z)],
                    d: [Math.round(b.dir.x * 1000) / 1000, Math.round(b.dir.y * 1000) / 1000, Math.round(b.dir.z * 1000) / 1000],
                    s: b.speed, dm: b.damage, r: b.range, b: big ? 1 : 0 });
    }
    function onWaveStart(num) {
        if (Juice.picking) Juice.pickPerk(0, true);     // a perk not picked in time: take the first
        if (isHost()) broadcast({ t: 'wave', n: num, b: isBossWave, m: currentWaveModifier });
    }
    function onWaveCleared() {
        if (!isHost()) return;
        broadcast({ t: 'cleared', n: wave });
        const gen = runGen;
        setTimeout(() => { if (gen === runGen && gameRunning && isHost() && running) startWave(wave + 1); }, 8000);
    }

    // ───────────────────────── client: mirror the host ─────────────────────────
    function makeProxy(id, kind, x, y, z, size) {
        const isBoss = kind === 'boss';
        const mesh = Toon.makeEnemy(isBoss ? 'boss' : kind, size);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        const e = { id, mesh, size, name: isBoss ? 'OVERLORD' : kind, isBoss,
                    behavior: isBoss ? 'boss' : (kind === 'SNIPER' ? 'sniper' : kind === 'BOMBER' ? 'bomber' : 'normal'),
                    maxHp: 1, bossPhase: 1, hitFlash: 0, buf: [], _hp: 1 };
        Object.defineProperty(e, 'hp', {
            configurable: true, enumerable: true,
            get() { return this._hp; },
            set(nv) { const d = this._hp - nv; this._hp = nv; if (d > 0) pendingHits.push({ e: this, d }); }
        });
        enemies.push(e); enemyById.set(id, e);
        return e;
    }
    function applySnap(m) {
        const now = performance.now();
        const seen = new Set();
        for (const a of m.e) {
            const [id, kind, x, y, z, r, ehp, emax, size, phase, flash] = a;
            seen.add(id);
            let e = enemyById.get(id);
            if (!e) { e = makeProxy(id, kind, x, y, z, size); e.mesh.rotation.set(0, r, 0); }
            e.buf.push({ t: now, x, y, z, r });
            if (e.buf.length > 30) e.buf.shift();
            e._hp = ehp; e.maxHp = emax; e.bossPhase = phase || 1;
            if (flash && e.hitFlash < 0.5) e.hitFlash = 1;
        }
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (!seen.has(e.id)) { disposeMesh(e.mesh); enemies.splice(i, 1); enemyById.delete(e.id); }
        }
        enemiesToSpawn = m.ts || 0;
        const dseen = new Set();
        for (const a of m.d) {
            const [id, type, pu, x, z] = a;
            dseen.add(id);
            if (pickedIds.has(id) || drops.some(d => d.id === id)) continue;
            const mesh = Toon.makeDrop(type === 'powerup' ? pu : type);
            mesh.position.set(x, 0.8, z);
            scene.add(mesh);
            drops.push({ id, mesh, type, powerup: pu || undefined });
        }
        for (let i = drops.length - 1; i >= 0; i--) {
            if (!dseen.has(drops[i].id)) { disposeMesh(drops[i].mesh); drops.splice(i, 1); }
        }
        for (const a of m.p) {
            const [slot, x, y, z, pyaw, php, pmhp, pdown, prev, pscore] = a;
            if (!players.has(slot)) continue;
            const p = players.get(slot);
            p.rev = (prev || 0) / 100 * REVIVE_MS;
            if (slot === mySlot) continue;
            pushSample(p, x, y, z, pyaw, 0);
            p.hp = php; p.mhp = pmhp; p.down = !!pdown; p.score = pscore;
        }
    }
    function clientTick() {
        const t = performance.now() - INTERP_MS;
        for (const e of enemies) {
            const s = sample(e.buf, t);
            if (s) { e.mesh.position.set(s.x, s.y, s.z); e.mesh.rotation.set(0, s.r, 0); }
            if (e.hitFlash > 0) {
                e.mesh.material.emissiveIntensity = 0.8 + e.hitFlash * 2.5;
                e.hitFlash = Math.max(0, e.hitFlash - 0.1);
            } else e.mesh.material.emissiveIntensity = 0.8;
        }
    }
    function flushHits() {
        if (!pendingHits.length) return;
        if (role !== 'client') { pendingHits = []; return; }
        const by = new Map();
        for (const h of pendingHits) {
            const cur = by.get(h.e.id) || [h.e.id, 0, 0];
            cur[1] += h.d;
            cur[2] = (h.e._meleeKill ? 1 : 0) | (h.e._headKill ? 2 : 0);
            by.set(h.e.id, cur);
        }
        pendingHits = [];
        send(hostConn, { t: 'hit', h: [...by.values()].map(h => [h[0], Math.round(h[1] * 10) / 10, h[2]]) });
    }
    function spawnEnemyBullet(m) {
        const mesh = Toon.makeEnemyBullet(!!m.b);
        mesh.position.set(m.p[0], m.p[1], m.p[2]);
        scene.add(mesh);
        enemyBullets.push({ mesh, dir: new THREE.Vector3(m.d[0], m.d[1], m.d[2]).normalize(), dist: 0, speed: m.s, damage: m.dm, range: m.r });
    }
    function clientGone(m) {
        const e = enemyById.get(m.id);
        if (!e) return;
        enemyById.delete(m.id);
        if (m.fx === 'boom') {
            createImpact(e.mesh.position, 0xff6600, 35);
            if (player && e.mesh.position.distanceTo(player.position) < 20) Sound.bomberBoom();
        } else if (m.k === mySlot) {
            e._meleeKill = !!(m.f & 1); e._headKill = !!(m.f & 2);
            const pts = Juice.onKill(e);
            killCount++;
            if (!aiAssistedRun) { totalEnemiesKilled++; localStorage.setItem('msc_total_kills', totalEnemiesKilled); }
            checkAchievements();
            if (e.isBoss) unlockAchievement('boss_slayer');
            addKillFeedEntry(`${e._meleeKill ? '🏏 ' : e._headKill ? '◎ ' : ''}${e.name} <b>+${pts}</b>${comboMultiplier > 1 ? ' <i>x' + comboMultiplier + '</i>' : ''}`, '#fff4e2');
        } else {
            otherKill(e);
            const p = players.get(m.k);
            addKillFeedEntry(`${esc(p ? p.name : 'TEAM')} › ${e.name}`, '#fff4e2');
        }
        if (e.isBoss) { isBossWave = false; const bb = $('boss-bar-wrapper'); if (bb) bb.style.display = 'none'; }
        disposeMesh(e.mesh);
        const i = enemies.indexOf(e);
        if (i >= 0) enemies.splice(i, 1);
    }
    function clientWave(m) {
        if (Juice.picking) Juice.pickPerk(0, true);
        if (m.late) {
            wave = m.n; isBossWave = !!m.b; currentWaveModifier = m.m || null; isWaveTransition = false;
            $('wave-status').innerText = isBossWave ? 'BOSS WAVE' : 'WAVE ' + wave;
            return;
        }
        if (m.n > 1 && waveDamageTaken === 0 && !isBossWave) unlockAchievement('flawless');
        if (m.n > 1) score += (m.n - 1) * 100;                 // the shared wave bonus
        wave = m.n; waveDamageTaken = 0; waveStartHp = hp;
        isBossWave = !!m.b; currentWaveModifier = m.m || null; isWaveTransition = true;
        if (currentWaveModifier) showModifierBanner(currentWaveModifier);
        if (isBossWave) {
            const bb = $('boss-bar-wrapper'); if (bb) bb.style.display = 'block';
            $('wave-status').innerText = 'BOSS INCOMING'; Sound.boss();
        } else $('wave-status').innerText = 'GET READY';
        const gen = runGen;
        setTimeout(() => {
            if (gen !== runGen || !gameRunning || !running) return;
            isWaveTransition = false;
            Juice.onWaveStart(wave, isBossWave);
            if (!isBossWave) $('wave-status').innerText = 'WAVE ' + wave;
        }, 1500);
    }

    // ───────────────────────── shots (visual only) ─────────────────────────
    const q3 = v => Math.round(v * 1000) / 1000;
    function onLocalShot(eye, dirs, hot) {
        const msg = { o: [r2(eye.x), r2(eye.y), r2(eye.z)], d: dirs.map(d => [q3(d.x), q3(d.y), q3(d.z)]), h: hot ? 1 : 0 };
        if (role === 'host') broadcast({ t: 'shot', s: mySlot, o: msg.o, d: msg.d, h: msg.h });
        else send(hostConn, { t: 'shot', o: msg.o, d: msg.d, h: msg.h });
    }
    function remoteShot(slot, o, ds, hot) {
        if (!scene || !Array.isArray(ds) || !Array.isArray(o)) return;
        for (const d of ds.slice(0, 6)) {
            const dir = new THREE.Vector3(d[0], d[1], d[2]).normalize();
            const mesh = Toon.makeBullet(dir, !!hot);
            const pos = new THREE.Vector3(o[0], o[1] - 0.25, o[2]).addScaledVector(dir, 0.8);
            mesh.position.copy(pos); mesh.lookAt(pos.clone().add(dir));
            scene.add(mesh);
            tracers.push({ mesh, dir, dist: 0 });
        }
        while (tracers.length > 60) { const t = tracers.shift(); disposeMesh(t.mesh); }
    }
    function updateTracers() {
        for (let i = tracers.length - 1; i >= 0; i--) {
            const t = tracers[i];
            t.mesh.position.addScaledVector(t.dir, 2.0); t.dist += 2.0;
            if (t.dist > 120 || t.mesh.position.y < 0.02 || checkCollision(t.mesh.position, 0.2)) { disposeMesh(t.mesh); tracers.splice(i, 1); }
        }
    }

    // ───────────────────────── down & revive ─────────────────────────
    function preFrame() {
        if (!running) return;
        if (!downed && hp <= 0) goDown();
        if (downed) hp = 0;
    }
    function goDown() {
        downed = true; hp = 0;
        Juice.run.firing = false;
        damageFlashAmount = 1; shakeAmount = 0.4;
        $('coop-down').classList.add('show');
        const me = players.get(mySlot); if (me) { me.down = true; me.rev = 0; }
        if (role === 'client') sendState();
    }
    function localRevive() {
        if (!downed) return;
        downed = false;
        hp = Math.ceil(playerMaxHp * 0.4);
        boosts.shield = Date.now() + 2500;
        $('coop-down').classList.remove('show');
        const me = players.get(mySlot); if (me) { me.down = false; me.rev = 0; me.hp = hp; }
        Juice.callout('BACK UP', 'a teammate revived you', 4, 'gold');
        if (role === 'client') sendState();
    }
    function localHurt(a) {
        if (downed || hp <= 0 || !gameRunning) return;
        if (boosts.shield && Date.now() < boosts.shield) return;
        if (difficultyMode === 'ghost') hp = 0;
        else { hp -= a; waveDamageTaken += a; }
        damageFlashAmount = 0.7; shakeAmount = 0.16; chromaAmount = 0.8;
        Juice.onPlayerHit();
    }
    function hostRevives(dt) {
        const me = players.get(mySlot);
        if (me && player) { me.x = player.position.x; me.y = player.position.y; me.z = player.position.z; me.down = downed; me.hp = Math.max(0, Math.ceil(hp)); me.mhp = playerMaxHp; me.score = score; }
        const all = [...players.values()];
        for (const p of all) {
            if (!p.down) { p.rev = 0; continue; }
            const helper = all.find(q => q !== p && standing(q) && Math.hypot(q.x - p.x, q.z - p.z) < REVIVE_R);
            p.rev = helper ? p.rev + dt : 0;
            if (p.rev >= REVIVE_MS) {
                p.rev = 0; p.down = false; p.hp = 1;
                if (p.slot === mySlot) localRevive(); else send(connOf(p.slot), { t: 'revive' });
                broadcast({ t: 'revived', s: p.slot, by: helper.slot });
                announceRevive(p.slot, helper.slot);
            }
        }
        if (all.length && all.every(p => p.down)) {
            if (!wipeAt) wipeAt = performance.now() + 700;
            else if (performance.now() > wipeAt) { wipeAt = 0; broadcast({ t: 'over' }); squadWiped(); }
        } else wipeAt = 0;
    }
    function announceRevive(slot, by) {
        const a = players.get(slot), b = players.get(by);
        if (a && b) addKillFeedEntry(`✚ ${esc(b.slot === mySlot ? 'YOU' : b.name)} revived ${esc(a.slot === mySlot ? 'YOU' : a.name)}`, '#8fdcb0');
    }
    function squadWiped() {
        if (!running) return;
        running = false;
        downed = false;
        $('coop-down').classList.remove('show');
        $('coop-revive').classList.remove('show');
        hp = 0;
        aiAssistedRun = false;
        $('coop-hud').style.display = 'none';
        window.triggerGameOver();
        const go = $('gameover');
        const k = go && go.querySelector('.go-kicker'); if (k) k.textContent = 'SQUAD DOWN · WAVE ' + wave + ' · CO-OP';
        const again = $('go-again');
        if (again) {
            if (role === 'host') again.textContent = '▶ PLAY AGAIN (SQUAD)';
            else { again.textContent = 'WAITING FOR THE HOST…'; again.disabled = true; again.classList.add('coop-wait'); }
        }
        const hint = go && go.querySelector('.go-hint'); if (hint) hint.textContent = '';
    }

    // ───────────────────────── per-frame (from animate) ─────────────────────────
    function postFrame() {
        const now = performance.now();
        const dt = lastFrame ? Math.min(100, now - lastFrame) : 16;
        lastFrame = now;
        if (downed) { hp = 0; camera.position.y -= 1.25; }
        if (isHost() && running) hostRevives(dt);
        updateAvatars(now);
        updateTracers();
        updateRevivePrompt();
        if (now - lastHud > 200) { lastHud = now; renderHud(); }
        if (role === 'client') flushHits();
    }
    function canAct() {
        if (downed) return false;
        const pm = $('pause-menu');
        if (pm && pm.style.display === 'flex') return false;
        if (Juice.picking) return false;
        return true;
    }

    // ───────────────────────── avatars & name tags ─────────────────────────
    function dropAvatar(p) {
        if (p.avatar) { if (p.avatar.parent) p.avatar.parent.remove(p.avatar); }
        p.avatar = null; p.tag = null; p.tagKey = '';
    }
    function makeTag() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 96;
        const tex = new THREE.CanvasTexture(c);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
        s.scale.set(1.9, 0.71, 1); s.renderOrder = 20;
        s.userData.canvas = c; s.userData.tex = tex;
        return s;
    }
    function roundRect(g, x, y, w, h, r) {
        g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
        g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function drawTag(p) {
        const pct = Math.max(0, Math.min(1, p.hp / (p.mhp || 100)));
        const key = p.name + '|' + Math.round(pct * 40) + '|' + (p.down ? 1 : 0) + '|' + Math.round(p.rev / 150);
        if (key === p.tagKey) return;
        p.tagKey = key;
        const c = p.tag.userData.canvas, g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        g.font = '700 30px Fredoka, Nunito, system-ui, sans-serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 7; g.strokeStyle = 'rgba(58,39,51,0.9)'; g.lineJoin = 'round';
        const label = p.down ? p.name + ' · DOWN' : p.name;
        g.strokeText(label, 128, 28);
        g.fillStyle = p.down ? '#ffc857' : '#fff4e2'; g.fillText(label, 128, 28);
        const w = 180, h = 16, x = 128 - w / 2, y = 58;          // HP bar, or revive progress while down
        g.fillStyle = 'rgba(58,39,51,0.85)'; roundRect(g, x - 4, y - 4, w + 8, h + 8, 10); g.fill();
        const fill = p.down ? Math.min(1, p.rev / REVIVE_MS) : pct;
        g.fillStyle = p.down ? '#ffc857' : (pct < 0.3 ? '#f6c6a4' : '#8fdcb0');
        if (fill > 0) { roundRect(g, x, y, Math.max(h, w * fill), h, 7); g.fill(); }
        p.tag.userData.tex.needsUpdate = true;
    }
    function updateAvatars(now) {
        if (!scene) return;
        const t = now - INTERP_MS;
        for (const p of players.values()) {
            if (p.slot === mySlot) continue;
            if (!p.buf.length && !p.avatar) continue;
            if (!p.avatar) {
                const holder = new THREE.Group();
                const body = Toon.makeOperative(p.char);
                body.scale.setScalar(1.08);
                holder.add(body);
                p.tag = makeTag(); holder.add(p.tag);
                holder.userData.body = body;
                scene.add(holder);
                p.avatar = holder; p.tagKey = '';
            }
            const s = sample(p.buf, t) || { x: p.x, y: p.y, z: p.z, r: p.yaw };
            p.avatar.position.set(s.x, s.y - 1.8, s.z);
            p.avatar.rotation.y = s.r + Math.PI;
            const body = p.avatar.userData.body;
            body.rotation.x = p.down ? -Math.PI / 2 : 0;
            body.position.y = p.down ? 0.42 : 0;
            body.position.z = p.down ? 0.9 : 0;
            p.tag.position.set(0, p.down ? 1.25 : 2.45, 0);
            drawTag(p);
        }
    }
    function updateRevivePrompt() {
        const el = $('coop-revive');
        if (!el || !player) return;
        let txt = '';
        if (!downed) {
            for (const p of players.values()) {
                if (p.slot === mySlot || !p.down) continue;
                if (Math.hypot(p.x - player.position.x, p.z - player.position.z) < REVIVE_R + 0.4) {
                    txt = `REVIVING ${esc(p.name)} <b>${Math.round(Math.min(1, p.rev / REVIVE_MS) * 100)}%</b>`; break;
                }
            }
        }
        if (txt) { if (el.innerHTML !== txt) el.innerHTML = txt; el.classList.add('show'); } else el.classList.remove('show');
        if (downed) {
            const me = players.get(mySlot);
            const f = $('coop-down-fill');
            if (f && me) f.style.width = Math.round(Math.min(1, me.rev / REVIVE_MS) * 100) + '%';
        }
    }
    function drawMinimap(ctx, cx, cy, scale) {
        if (!player) return;
        for (const p of players.values()) {
            if (p.slot === mySlot || !p.buf.length) continue;
            const x = cx + (p.x - player.position.x) * scale, y = cy + (p.z - player.position.z) * scale;
            ctx.fillStyle = p.down ? '#ffc857' : (OPC[p.char] || '#fff4e2');
            ctx.strokeStyle = '#fff4e2'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
    }

    // ───────────────────────── run lifecycle ─────────────────────────
    function withSeed(fn) {
        const orig = Math.random;
        let a = (seed >>> 0) || 1;
        Math.random = function () {              // mulberry32: the same city on every screen
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
        try { return fn(); } finally { Math.random = orig; }
    }
    function hostStart() {
        if (role !== 'host' || !inRoom) return;
        seed = ((Math.random() * 2147483646) | 0) + 1;
        broadcast({ t: 'start', seed, diff: difficultyMode });
        beginRun(seed, difficultyMode);
    }
    function beginRun(s, diff) {
        seed = s;
        if (diff && role === 'client') difficultyMode = diff;
        active = true; running = true; downed = false; wipeAt = 0;
        aiAssistedRun = false;                     // AI can't touch a co-op run, so it always earns XP
        if (typeof NEXUS !== 'undefined') { try { if (NEXUS.isTraining) NEXUS.stopTraining(); if (NEXUS.on) NEXUS.disable(); } catch (e) {} }
        try { const ap = $('ai-panel'); if (ap) ap.classList.remove('show'); } catch (e) {}
        document.body.classList.add('coop-run');
        closeModal();
        $('coop-end').classList.remove('show');
        $('coop-down').classList.remove('show');
        // clean slate (same as an in-place restart)
        runGen++;
        const go = $('gameover'); if (go) { go.classList.remove('show'); go.style.display = 'none'; }
        if (typeof enemies !== 'undefined') {
            enemies.forEach(e => disposeMesh(e.mesh)); bullets.forEach(b => disposeMesh(b.mesh));
            enemyBullets.forEach(b => disposeMesh(b.mesh)); drops.forEach(d => disposeMesh(d.mesh));
        }
        tracers.forEach(t => disposeMesh(t.mesh)); tracers = [];
        enemies.length = 0; bullets.length = 0; enemyBullets.length = 0; drops.length = 0;
        buildings.length = 0; particles.length = 0; killFeedEntries.length = 0;
        enemyById.clear(); pickedIds.clear(); pendingHits = [];
        score = 0; wave = 0; enemiesToSpawn = 0; isWaveTransition = false; gamePaused = false;
        isBossWave = false; currentWaveModifier = null; isReloading = false; lastShotTime = 0;
        shakeAmount = 0; damageFlashAmount = 0; chromaAmount = 0; yaw = 0; pitch = 0; tutorialMode = false;
        ['boss-bar-wrapper', 'pause-menu'].forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
        const pm = $('perk-modal'); if (pm) pm.classList.remove('show');
        for (const p of players.values()) { p.down = false; p.rev = 0; p.buf = []; dropAvatar(p); }
        const tut = $('tutorial-overlay'); if (tut) tut.style.display = 'none';
        $('menu').style.display = 'none';
        checkDevice();
        if (isMobile) requestFullscreen();
        startGameCore();
        if (isMobile && !isLandscape()) updateOrientationOverlay();
        if (!isMobile) setTimeout(() => { if (running && gameRunning && !document.pointerLockElement) showMenu(); }, 500);
        $('coop-hud').style.display = 'block';
        lastHud = 0; renderHud();
    }
    function onRunInit() {
        for (const p of players.values()) dropAvatar(p);
        const off = SPAWN[mySlot % SPAWN.length];
        if (spawnAt) player.position.set(spawnAt[0] + off[0] + 1.5, 1.8, spawnAt[1] + off[1]);
        else player.position.set(off[0], 1.8, off[1]);
        lastFrame = 0;
    }
    function playAgain() {
        if (role === 'host') hostStart();
        else showFloatingFeedback('THE HOST RESTARTS THE RUN', 'warn');
    }
    function hostLeft() {
        if (role !== 'client') return;
        if (!inRoom) { resetNet(); return; }
        if (active) {
            running = false;
            gameRunning = false;
            if (document.pointerLockElement) document.exitPointerLock();
            $('coop-down').classList.remove('show');
            $('coop-revive').classList.remove('show');
            const go = $('gameover'); if (go) { go.classList.remove('show'); go.style.display = 'none'; }
            $('coop-end').classList.add('show');
            resetNet(true);
        } else {
            resetNet();
            status('The host closed the room.', true);
            showPane('choose');
        }
    }
    function leave() {
        if (role === 'host') broadcast({ t: 'bye' });
        else if (hostConn) send(hostConn, { t: 'bye' });
        resetNet();
        active = false; running = false; downed = false;
        tracers.forEach(t => disposeMesh(t.mesh)); tracers = [];
        document.body.classList.remove('coop-run');
        ['coop-down', 'coop-revive', 'coop-end'].forEach(id => $(id).classList.remove('show'));
        $('coop-hud').style.display = 'none';
        const t = $('pause-title'); if (t) t.textContent = 'STANDBY';
        const tag = $('pause-tag'); if (tag) tag.innerHTML = '<span class="status-pulse-dot"></span> TACTICAL FEED SUSPENDED';
        if (/[?&]room=/.test(location.search)) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    }
    function resetNet(keepActive) {
        clearInterval(netTimer); netTimer = null;
        clearTimeout(connectTimer);
        const p = peer; peer = null;
        setTimeout(() => { try { if (p) p.destroy(); } catch (e) {} }, 200);
        hostConn = null; conns.clear();
        for (const pl of players.values()) dropAvatar(pl);
        if (!keepActive) players.clear();
        enemyById.clear();
        inRoom = false;
        if (!keepActive) { role = null; code = ''; active = false; running = false; }
    }

    // ───────────────────────── HUD ─────────────────────────
    function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function renderHud() {
        const el = $('coop-hud');
        if (!el || !active) return;
        const me = players.get(mySlot);
        if (me) { me.hp = Math.max(0, Math.ceil(hp)); me.mhp = playerMaxHp; me.down = downed; me.score = score; }
        const rows = [...players.values()].sort((a, b) => a.slot - b.slot).map(p => {
            const pct = Math.max(0, Math.min(100, p.hp / (p.mhp || 100) * 100));
            return `<div class="ch-row${p.down ? ' down' : ''}${p.slot === mySlot ? ' me' : ''}">` +
                `<span class="ch-dot" style="background:${OPC[p.char] || '#fff4e2'}"></span>` +
                `<span class="ch-name">${esc(p.name)}${p.slot === mySlot ? ' <i>YOU</i>' : ''}</span>` +
                `<span class="ch-bar"><span style="width:${p.down ? 0 : pct.toFixed(0)}%"></span></span>` +
                `<span class="ch-hp">${p.down ? 'DOWN' : Math.ceil(p.hp)}</span></div>`;
        }).join('');
        const html = `<div class="ch-head">CO-OP · ${esc(code)}</div>${rows}`;
        if (el._html !== html) { el.innerHTML = html; el._html = html; }
    }
    function announce(text, sub) { if (typeof Juice !== 'undefined' && gameRunning) Juice.callout(text, sub || null, 2, 'small'); }

    function showMenu() {
        if (!gameRunning) return;
        if (document.pointerLockElement) document.exitPointerLock();
        Juice.run.firing = false;
        const pm = $('pause-menu'); if (!pm) return;
        const t = $('pause-title'); if (t) t.textContent = 'CO-OP';
        const tag = $('pause-tag'); if (tag) tag.innerHTML = '<span class="status-pulse-dot"></span> THE RUN KEEPS GOING';
        pm.style.display = 'flex';
    }
    function toggleMenu() {
        const pm = $('pause-menu');
        if (pm && pm.style.display === 'flex') resumeGame(); else showMenu();
    }

    // ───────────────────────── lobby UI ─────────────────────────
    function buildDom() {
        if ($('coop-modal')) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = `
<div id="coop-modal" class="coop-modal" style="display:none">
  <div class="coop-card">
    <button class="coop-x" id="coop-x" aria-label="Close">✕</button>
    <div class="coop-kicker">PLAY WITH FRIENDS · 2–4</div>
    <div class="coop-title">CO-OP</div>
    <label class="coop-name-row"><span>YOUR NAME</span><input id="coop-name" maxlength="12" autocomplete="off" spellcheck="false"></label>
    <div id="coop-pane-choose">
      <button id="coop-host-btn" class="coop-big">HOST A ROOM</button>
      <div class="coop-or">or join a friend</div>
      <div class="coop-join-row">
        <input id="coop-code-in" placeholder="CODE" maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false">
        <button id="coop-join-btn" class="coop-join">JOIN</button>
      </div>
    </div>
    <div id="coop-pane-room" style="display:none">
      <div class="coop-code-label">ROOM CODE</div>
      <div id="coop-code" class="coop-code">····</div>
      <div id="coop-link" class="coop-link"></div>
      <div class="coop-share-row">
        <button id="coop-share" class="coop-small">SHARE LINK</button>
        <button id="coop-copy" class="coop-small">COPY CODE</button>
      </div>
      <div id="coop-roster" class="coop-roster"></div>
      <button id="coop-start" class="coop-big">START RUN</button>
      <div id="coop-wait" class="coop-wait-note">waiting for the host to start…</div>
      <button id="coop-leave" class="coop-ghost">LEAVE ROOM</button>
    </div>
    <div id="coop-status" class="coop-status"></div>
  </div>
</div>
<div id="coop-hud" style="display:none"></div>
<div id="coop-revive"></div>
<div id="coop-down"><div class="cd-card"><div class="cd-title">YOU'RE DOWN</div>
  <div class="cd-sub">a teammate can revive you: they stand next to you for 3 seconds</div>
  <div class="cd-track"><div id="coop-down-fill"></div></div></div></div>
<div id="coop-end"><div class="ce-card"><div class="ce-kicker">CO-OP</div><div class="ce-title">HOST LEFT</div>
  <div class="ce-sub">the room closed, so this run is over</div>
  <button id="coop-end-btn" class="coop-big">BACK TO MENU</button></div></div>`;
        while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
        const stop = el => ['touchstart', 'mousedown', 'pointerdown'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
        ['coop-modal', 'coop-end'].forEach(id => stop($(id)));
        const name = $('coop-name');
        name.value = myName();
        name.addEventListener('input', () => {
            const v = name.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 12);
            if (v !== name.value) name.value = v;
            if (v.trim()) localStorage.setItem('msc_name', v.trim());
        });
        const codeIn = $('coop-code-in');
        codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5); });
        codeIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clickJoin(); } });
        $('coop-x').addEventListener('click', () => { click(); if (inRoom) leave(); closeModal(); });
        $('coop-host-btn').addEventListener('click', () => { click(); host(); });
        $('coop-join-btn').addEventListener('click', clickJoin);
        $('coop-start').addEventListener('click', () => { click(); hostStart(); });
        $('coop-leave').addEventListener('click', () => { click(); leave(); showPane('choose'); status(''); });
        $('coop-copy').addEventListener('click', () => { click(); copy(code, 'Code copied'); });
        $('coop-share').addEventListener('click', () => {
            click();
            const url = shareUrl();
            if (navigator.share) navigator.share({ title: 'Mood Shift City co-op', text: 'Join my Mood Shift City run! Room ' + code, url }).catch(() => {});
            else copy(url, 'Link copied');
        });
        $('coop-end-btn').addEventListener('click', () => { click(); $('coop-end').classList.remove('show'); exitToMenu(); });
    }
    function click() { if (typeof Sound !== 'undefined') Sound.uiClick(); }
    function clickJoin() {
        click();
        checkDevice();
        if (isMobile) requestFullscreen();          // the tap is the gesture fullscreen needs
        if (audioCtx.state === 'suspended') audioCtx.resume();
        join($('coop-code-in').value);
    }
    function copy(text, ok) {
        const done = () => status(ok);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => status(text));
        else status(text);
    }
    function status(msg, bad) {
        const el = $('coop-status'); if (!el) return;
        el.textContent = msg || ''; el.classList.toggle('bad', !!bad);
    }
    function showPane(which) {
        $('coop-pane-choose').style.display = which === 'choose' ? 'block' : 'none';
        $('coop-pane-room').style.display = which === 'room' ? 'block' : 'none';
    }
    function shareUrl() { return location.origin + location.pathname + '?room=' + code; }
    function renderRoom() {
        if (!inRoom || !$('coop-code')) return;
        $('coop-code').textContent = code;
        $('coop-link').textContent = shareUrl().replace(/^https?:\/\//, '');
        const list = $('coop-roster');
        list.innerHTML = '';
        [...players.values()].sort((a, b) => a.slot - b.slot).forEach(p => {
            const row = document.createElement('div'); row.className = 'coop-pl';
            const dot = document.createElement('span'); dot.className = 'coop-pl-dot'; dot.style.background = OPC[p.char] || '#fff4e2';
            const nm = document.createElement('span'); nm.className = 'coop-pl-name'; nm.textContent = p.name;
            const op = document.createElement('span'); op.className = 'coop-pl-op';
            op.textContent = p.char.toUpperCase() + (p.slot === 0 ? ' · HOST' : '') + (p.slot === mySlot ? ' · YOU' : '');
            row.append(dot, nm, op); list.appendChild(row);
        });
        for (let i = players.size; i < MAX; i++) {
            const row = document.createElement('div'); row.className = 'coop-pl empty'; row.textContent = 'open slot';
            list.appendChild(row);
        }
        const isH = role === 'host';
        $('coop-start').style.display = isH ? 'block' : 'none';
        $('coop-start').textContent = players.size > 1 ? 'START RUN · ' + players.size + ' PLAYERS' : 'START RUN (friends can join mid-run)';
        $('coop-wait').style.display = isH ? 'none' : 'block';
    }
    function open(prefillCode) {
        buildDom();
        $('coop-modal').style.display = 'flex';
        $('coop-name').value = myName();
        if (!inRoom) { showPane('choose'); status(''); }
        if (prefillCode) {
            $('coop-code-in').value = String(prefillCode).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
            status('Tap JOIN to hop into room ' + $('coop-code-in').value + '.');
            $('coop-join-btn').classList.add('pulse');
        }
        loadPeer().catch(() => {});                 // warm the library while they type
    }
    function closeModal() { const m = $('coop-modal'); if (m) m.style.display = 'none'; }

    // A shared link (?room=CODE) opens straight into the join screen.
    function boot() {
        buildDom();
        const room = new URLSearchParams(location.search).get('room');
        if (room) {
            const tut = $('tutorial-overlay'); if (tut) tut.style.display = 'none';
            open(room);
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

    return {
        get active() { return active; }, get downed() { return downed; }, get inRoom() { return inRoom; },
        isHost, isClient, open, leave, withSeed, canAct, preFrame, postFrame, clientTick,
        target, spawnAnchor, hurtRemote, scaleCount, onSpawn, killedByMe, killerName, otherKill, enemyGone, ebSpawn,
        onWaveStart, onWaveCleared, onLocalShot, onLocalPickup(d) { if (role === 'client' && d.id) { pickedIds.add(d.id); send(hostConn, { t: 'pick', id: d.id }); } },
        drawMinimap, onRunInit, playAgain, toggleMenu, showMenu,
        _debug: () => ({ role, code, mySlot, inRoom, active, running, downed, players: [...players.values()].map(p => ({ slot: p.slot, name: p.name, x: p.x, z: p.z, hp: p.hp, down: p.down, rev: p.rev, avatar: !!p.avatar })), enemies: enemies.map(e => ({ id: e.id, hp: Math.ceil(e.hp), x: +e.mesh.position.x.toFixed(2), z: +e.mesh.position.z.toFixed(2) })) })
    };
})();
