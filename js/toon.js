// ── js/toon.js ──
// "Golden Hour Toon" art direction: warm limited palette, toon shading with ink
// outlines, gradient sky, soft long shadows. Enemies are the only things in the
// hot-coral accent. Also owns the gun viewmodel, tracers and paper-confetti FX.

const Toon = (() => {
    const PAL = {
        skyTop:   new THREE.Color(0x1f4e5a),   // deep teal
        skyMid:   new THREE.Color(0xc98d9b),   // dusty rose
        horizon:  new THREE.Color(0xf6c6a4),   // peach haze
        sun:      new THREE.Color(0xfff1d6),
        fog:      0xefbfa2,
        ground:   0xe4c29c,
        walls:    [0xf3d3ae, 0xeab99a, 0xf7e0c4, 0xdfae8f, 0xf0c7a2, 0xe9cdb4],
        roofs:    [0xcf9c84, 0xc48d7a, 0xd8ab8f],
        ink:      0x3a2733,                    // outline colour (deep plum, softer than black)
        accent:   0xff5a3c,                    // hot coral — enemies only
        accentDk: 0x4a1a12,                    // enemy emissive base (lifted on hit flash)
        cream:    0xfff4e2,
        eyeDark:  0x2a1a20
    };
    const SHARED = { shared: true };

    // ── Toon ramp + material cache ──
    let ramp = null;
    function getRamp() {
        if (ramp) return ramp;
        ramp = new THREE.DataTexture(new Uint8Array([105, 105, 105, 190, 190, 190, 255, 255, 255]), 3, 1, THREE.RGBFormat);
        ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
        ramp.generateMipmaps = false;
        ramp.needsUpdate = true;
        return ramp;
    }
    const matCache = {};
    function toonMat(color, opts = {}) {
        const key = color + '|' + JSON.stringify(opts);
        if (matCache[key]) return matCache[key];
        const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: getRamp() }, opts));
        m.userData = SHARED;
        return (matCache[key] = m);
    }
    function basicMat(color, opts = {}) {
        const key = 'b' + color + '|' + JSON.stringify(opts);
        if (matCache[key]) return matCache[key];
        const m = new THREE.MeshBasicMaterial(Object.assign({ color }, opts));
        m.userData = SHARED;
        return (matCache[key] = m);
    }
    const inkMat = () => basicMat(PAL.ink, { side: THREE.BackSide });

    const geoCache = {};
    function geo(key, make) {
        if (!geoCache[key]) { geoCache[key] = make(); geoCache[key].userData = SHARED; }
        return geoCache[key];
    }

    // Inverted-hull outline: a slightly bigger back-faced copy in ink colour.
    function outline(mesh, sx, sy, sz) {
        const o = new THREE.Mesh(mesh.geometry, inkMat());
        o.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
        o.castShadow = false; o.receiveShadow = false;
        o.raycast = () => {};
        mesh.add(o);
        return o;
    }

    // ── Canvas textures ──
    function canvasTex(w, h, draw) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        draw(c.getContext('2d'), w, h);
        const t = new THREE.CanvasTexture(c);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        return t;
    }
    let windowTex = null, groundTex = null, flashTex = null;
    function getWindowTex() {
        if (windowTex) return windowTex;
        windowTex = canvasTex(64, 64, (g, w, h) => {
            g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#8c9fae'; g.fillRect(14, 12, 36, 38);         // glass
            g.fillStyle = '#b9c9d2'; g.fillRect(14, 12, 12, 38);         // glint
            g.fillStyle = '#e9ddd2'; g.fillRect(10, 50, 44, 5);          // sill
        });
        windowTex.anisotropy = 2;
        return windowTex;
    }
    function getGroundTex() {
        if (groundTex) return groundTex;
        groundTex = canvasTex(128, 128, (g, w, h) => {
            g.fillStyle = '#d6b089'; g.fillRect(0, 0, w, h);
            g.fillStyle = '#c49c78';
            g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
            g.fillStyle = '#dcb894'; g.fillRect(3, 3, 60, 60); g.fillRect(66, 66, 59, 59);
        });
        groundTex.repeat.set(125, 125);
        groundTex.anisotropy = 4;
        return groundTex;
    }
    function getFlashTex() {
        if (flashTex) return flashTex;
        flashTex = canvasTex(64, 64, (g) => {
            g.translate(32, 32);
            const grd = g.createRadialGradient(0, 0, 2, 0, 0, 30);
            grd.addColorStop(0, 'rgba(255,250,235,1)'); grd.addColorStop(0.35, 'rgba(255,214,140,0.9)'); grd.addColorStop(1, 'rgba(255,160,90,0)');
            g.fillStyle = grd;
            g.beginPath();
            for (let i = 0; i < 10; i++) {
                const r = i % 2 ? 9 : 30, a = i / 10 * Math.PI * 2;
                g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            g.closePath(); g.fill();
        });
        return flashTex;
    }

    // ── Sky dome ──
    let sky = null, sun = null;
    const SUN_DIR = new THREE.Vector3(-0.78, 0.36, -0.52).normalize();
    function makeSky() {
        const m = new THREE.ShaderMaterial({
            uniforms: {
                top: { value: PAL.skyTop }, mid: { value: PAL.skyMid }, hor: { value: PAL.horizon },
                sunCol: { value: PAL.sun }, sunDir: { value: SUN_DIR }
            },
            vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader: [
                'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 sunDir; varying vec3 vDir;',
                'void main(){',
                '  float h = clamp(vDir.y, 0.0, 1.0);',
                '  vec3 c = mix(hor, mid, smoothstep(0.02, 0.28, h));',
                '  c = mix(c, top, smoothstep(0.22, 0.85, h));',
                '  float s = max(dot(normalize(vDir), sunDir), 0.0);',
                '  c = mix(c, hor * 1.06, pow(s, 6.0) * 0.55);',
                '  c = mix(c, sunCol, step(0.9975, s));',          // flat toon sun disc
                '  c = mix(c, sunCol, step(0.993, s) * 0.35);',    // halo ring
                '  gl_FragColor = vec4(c, 1.0);',
                '}'
            ].join('\n'),
            side: THREE.BackSide, depthWrite: false, fog: false
        });
        const s = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), m);
        s.renderOrder = -10;
        s.frustumCulled = false;
        return s;
    }

    // ── World ──
    function buildWorld() {
        scene.background = PAL.horizon.clone();
        scene.fog = new THREE.Fog(PAL.fog, 28, 165);

        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

        sky = makeSky(); scene.add(sky);

        scene.add(new THREE.HemisphereLight(0xffe6d2, 0x8a6680, 0.62));
        sun = new THREE.DirectionalLight(0xffdcb0, 0.62);
        sun.castShadow = true;
        const sm = isMobile ? 1024 : 2048;
        sun.shadow.mapSize.set(sm, sm);
        const sc = sun.shadow.camera;
        sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 220;
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.04;
        scene.add(sun); scene.add(sun.target);

        const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshToonMaterial({ color: 0xffffff, map: getGroundTex(), gradientMap: getRamp() }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        // A soft circular plaza under the spawn point
        const plaza = new THREE.Mesh(new THREE.CircleGeometry(9, 40), toonMat(0xdcb08e));
        plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.02; plaza.receiveShadow = true;
        scene.add(plaza);
        const ring = new THREE.Mesh(new THREE.RingGeometry(9, 9.35, 48), basicMat(0xd7a98a));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
        scene.add(ring);

        const sideMats = PAL.walls.map(c => [toonMat(c, { map: getWindowTex() }), toonMat(c)]);
        const roofMats = PAL.roofs.map(c => toonMat(c));
        for (let i = 0; i < 40; i++) {
            const bh = Math.random() * 20 + 10;
            const bw = 5, bd = 5;
            let bx = Math.random() * 200 - 100, bz = Math.random() * 200 - 100;
            if (Math.abs(bx) < 15 && Math.abs(bz) < 15) bx += 25;

            const g = new THREE.BoxGeometry(bw, bh, bd);
            // Tile the window texture by world size (one window ~2.5 x 3 units)
            const uv = g.attributes.uv;
            for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * 2, uv.getY(v) * Math.round(bh / 3));
            uv.needsUpdate = true;
            const pi = i % PAL.walls.length;
            const side = sideMats[pi][0], roof = roofMats[i % roofMats.length];
            const mesh = new THREE.Mesh(g, [side, side, roof, roof, side, side]);
            mesh.position.set(bx, bh / 2, bz);
            mesh.castShadow = true; mesh.receiveShadow = true;
            outline(mesh, (bw + 0.28) / bw, (bh + 0.28) / bh, (bd + 0.28) / bd);
            scene.add(mesh);
            buildings.push({ minX: bx - 2.5, maxX: bx + 2.5, minY: 0, maxY: bh, minZ: bz - 2.5, maxZ: bz + 2.5 });

            // Roof trims and props for silhouette variety
            const cap = new THREE.Mesh(geo('cap', () => new THREE.BoxGeometry(5.5, 0.5, 5.5)), roof);
            cap.position.set(bx, bh + 0.25, bz); cap.castShadow = true;
            scene.add(cap);
            const r = Math.random();
            if (r < 0.35) {
                const tank = new THREE.Mesh(geo('tank', () => new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12)), toonMat(0xb98c7c));
                tank.position.set(bx + 1, bh + 1.6, bz - 0.8); tank.castShadow = true;
                const legs = new THREE.Mesh(geo('tankLegs', () => new THREE.BoxGeometry(1.4, 0.8, 1.4)), toonMat(0x8f6a64));
                legs.position.set(bx + 1, bh + 0.9, bz - 0.8);
                scene.add(tank); scene.add(legs);
            } else if (r < 0.7) {
                const ac = new THREE.Mesh(geo('ac', () => new THREE.BoxGeometry(1.6, 0.9, 1.2)), toonMat(0xe9d8c6));
                ac.position.set(bx - 1.1, bh + 0.95, bz + 1); ac.castShadow = true;
                scene.add(ac);
            }
        }

        // Low distant skyline silhouettes outside the play area (pure scenery, no collision)
        const silMat = toonMat(0xd49a8e);
        for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2 + Math.random() * 0.1;
            const d = 170 + Math.random() * 30;
            const h = 20 + Math.random() * 40;
            const m = new THREE.Mesh(geo('sil', () => new THREE.BoxGeometry(1, 1, 1)), silMat);
            m.scale.set(10 + Math.random() * 10, h, 10 + Math.random() * 10);
            m.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d);
            scene.add(m);
        }

        buildFX();
        buildGun();
    }

    // ── Enemies: chunky little characters in hot coral ──
    function makeEnemy(kind, size) {
        kind = (kind || 'runner').toLowerCase();
        const s = size;
        const bodyMat = new THREE.MeshToonMaterial({ color: PAL.accent, emissive: PAL.accentDk, emissiveIntensity: 0.8, gradientMap: getRamp() });
        let bodyGeo, bodyY = 0, headR = 0.3 * s, headY = 0.9 * s - headR;
        if (kind === 'tank') {
            bodyGeo = geo('tankBody' + s, () => new THREE.CylinderGeometry(s * 0.5, s * 0.58, s * 1.05, 8));
            bodyY = -0.15 * s; headR = 0.22 * s; headY = 0.9 * s - headR;
        } else if (kind === 'bomber') {
            bodyGeo = geo('bombBody' + s, () => new THREE.SphereGeometry(s * 0.55, 18, 12));
            bodyY = -0.3 * s; headR = 0; headY = -0.3 * s;
        } else if (kind === 'boss') {
            bodyGeo = geo('bossBody' + s, () => new THREE.CylinderGeometry(s * 0.42, s * 0.5, s * 1.0, 14));
            bodyY = -0.25 * s; headR = 0.3 * s; headY = 0.9 * s - headR - 0.12 * s;
        } else {
            bodyGeo = geo('body' + s, () => new THREE.CylinderGeometry(s * 0.34, s * 0.4, s * 0.85, 12));
            bodyY = -0.15 * s;
        }
        // Root is an empty carrier mesh that owns the body material, so the game's
        // e.mesh.material (hit flash, minimap colour, kill colour) keeps working.
        const root = new THREE.Mesh(geo('empty', () => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
            g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.01);
            return g;
        }), bodyMat);
        root.frustumCulled = false;
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = bodyY;
        body.castShadow = true;
        outline(body, 1.09);
        root.add(body);

        const ink = basicMat(PAL.eyeDark);
        const cream = toonMat(PAL.cream);

        if (headR > 0) {
            const head = new THREE.Mesh(geo('head' + headR.toFixed(3), () => new THREE.SphereGeometry(headR, 16, 12)), bodyMat);
            head.position.y = headY; head.castShadow = true;
            outline(head, 1.1);
            root.add(head);
            // eyes face +Z (lookAt points +Z at the player)
            const eyeR = headR * (kind === 'scout' ? 0.42 : 0.26);
            const eyeGeo = geo('eye' + eyeR.toFixed(3), () => new THREE.SphereGeometry(eyeR, 10, 8));
            const pupGeo = geo('pup' + eyeR.toFixed(3), () => new THREE.SphereGeometry(eyeR * 0.55, 8, 6));
            const eyes = kind === 'sniper' ? [] : kind === 'scout' ? [0] : kind === 'boss' ? [-0.5, 0, 0.5] : [-0.42, 0.42];
            for (const ex of eyes) {
                const eye = new THREE.Mesh(eyeGeo, cream);
                eye.position.set(ex * headR, headY + headR * 0.12, headR * 0.82);
                const pup = new THREE.Mesh(pupGeo, ink);
                pup.position.z = eyeR * 0.6;
                eye.add(pup);
                root.add(eye);
            }
            if (kind === 'sniper') {
                // visor band + long barrel
                const visor = new THREE.Mesh(geo('visor' + headR.toFixed(3), () => new THREE.BoxGeometry(headR * 2.1, headR * 0.45, headR * 0.6)), ink);
                visor.position.set(0, headY + headR * 0.1, headR * 0.65);
                root.add(visor);
                // lenses sit on the visor's front face (eyes used to poke through it)
                const lensGeo = geo('lens' + headR.toFixed(3), () => new THREE.CircleGeometry(headR * 0.16, 14));
                for (const lx of [-0.45, 0.45]) {
                    const lens = new THREE.Mesh(lensGeo, basicMat(0xfff0b0));
                    lens.position.set(lx * headR, headY + headR * 0.1, headR * 0.65 + headR * 0.3 + 0.01);
                    root.add(lens);
                }
                const barrel = new THREE.Mesh(geo('barrel' + s, () => new THREE.BoxGeometry(s * 0.12, s * 0.12, s * 1.3)), toonMat(PAL.ink));
                barrel.position.set(s * 0.5, 0.05 * s, s * 0.45);
                root.add(barrel);
            }
            if (kind === 'scout') {
                const ant = new THREE.Mesh(geo('ant' + s, () => new THREE.CylinderGeometry(s * 0.03, s * 0.03, s * 0.45, 5)), toonMat(PAL.ink));
                ant.position.set(0, headY + headR + s * 0.2, 0);
                const tip = new THREE.Mesh(geo('antTip' + s, () => new THREE.SphereGeometry(s * 0.08, 8, 6)), bodyMat);
                tip.position.set(0, headY + headR + s * 0.45, 0);
                root.add(ant); root.add(tip);
            }
            if (kind === 'boss') {
                const spikeGeo = geo('spike' + s, () => new THREE.ConeGeometry(s * 0.08, s * 0.3, 6));
                for (let k = -2; k <= 2; k++) {
                    const sp = new THREE.Mesh(spikeGeo, cream);
                    sp.position.set(k * headR * 0.38, headY + headR * 0.95, 0);
                    sp.rotation.z = -k * 0.2;
                    root.add(sp);
                }
            }
        }
        if (kind === 'tank') {
            const padGeo = geo('pad' + s, () => new THREE.BoxGeometry(s * 0.35, s * 0.3, s * 0.6));
            for (const sx of [-1, 1]) {
                const pad = new THREE.Mesh(padGeo, toonMat(PAL.cream));
                pad.position.set(sx * s * 0.58, s * 0.25, 0);
                outline(pad, 1.12);
                root.add(pad);
            }
        }
        if (kind === 'bomber') {
            const eyeGeo = geo('beye' + s, () => new THREE.SphereGeometry(s * 0.13, 10, 8));
            for (const ex of [-0.2, 0.2]) {
                const eye = new THREE.Mesh(eyeGeo, cream);
                eye.position.set(ex * s, -0.2 * s, s * 0.48);
                const pup = new THREE.Mesh(geo('bpup' + s, () => new THREE.SphereGeometry(s * 0.07, 8, 6)), ink);
                pup.position.z = s * 0.08; eye.add(pup); root.add(eye);
            }
            const fuse = new THREE.Mesh(geo('fuse' + s, () => new THREE.CylinderGeometry(s * 0.05, s * 0.05, s * 0.35, 5)), toonMat(PAL.ink));
            fuse.position.y = 0.38 * s; root.add(fuse);
            const spark = new THREE.Mesh(geo('spark' + s, () => new THREE.SphereGeometry(s * 0.1, 8, 6)), basicMat(0xfff0b0));
            spark.position.y = 0.58 * s; spark.userData.spark = true; root.add(spark);
        }
        if (kind !== 'bomber' && kind !== 'tank') {
            // stubby legs
            const legGeo = geo('leg' + s, () => new THREE.BoxGeometry(s * 0.16, s * 0.32, s * 0.2));
            for (const lx of [-0.17, 0.17]) {
                const leg = new THREE.Mesh(legGeo, toonMat(PAL.ink));
                leg.position.set(lx * s, -0.74 * s, 0);
                leg.userData.leg = lx;
                root.add(leg);
            }
        }
        // Yaw-first Euler order: lookAt() then decomposes to a pure Y turn, so the
        // waddle that animateEnemy writes into rotation.z can never inherit an
        // x = PI flip (the cause of enemies standing on their heads when facing away).
        root.rotation.order = 'YXZ';
        root.userData.kind = kind;
        root.userData.headY = headY;
        root.userData.headR = headR;
        root.userData.size = s;
        root.userData.spawnT = performance.now();
        return root;
    }

    // Small idle animation: waddle + squash, bomber spark flicker, spawn pop-in
    function animateEnemy(e, now) {
        const m = e.mesh, u = m.userData;
        if (!u || !u.kind) return;
        const age = (now - u.spawnT) / 1000;
        const pop = age < 0.35 ? Math.min(1, 0.2 + age / 0.35 * 1.1) : 1;
        const t = now * 0.012 + (m.id % 7);
        const sq = 1 + Math.sin(t * 2) * 0.04;
        m.scale.set(pop / Math.sqrt(sq), pop * sq, pop / Math.sqrt(sq));
        m.rotation.z = Math.sin(t) * 0.08;
        for (const c of m.children) {
            if (c.userData.leg) c.position.z = Math.sin(t * 2 + (c.userData.leg > 0 ? Math.PI : 0)) * u.size * 0.12;
            if (c.userData.spark) c.visible = Math.sin(now * 0.04) > -0.3;
        }
    }

    // Head-hit test: is the bullet travelling through the enemy's head sphere?
    function isHeadshot(e, pos, dir) {
        const u = e.mesh.userData;
        if (!u || !u.headR) return false;
        const hc = new THREE.Vector3(e.mesh.position.x, e.mesh.position.y + u.headY * e.mesh.scale.y, e.mesh.position.z);
        // closest distance from the head centre to the bullet's path segment (last 2.5 units)
        const start = pos.clone().addScaledVector(dir, -2.5);
        const toC = hc.clone().sub(start);
        const tt = Math.max(0, Math.min(2.5 + 0.8, toC.dot(dir)));
        const closest = start.addScaledVector(dir, tt);
        return closest.distanceTo(hc) < u.headR + 0.22;
    }

    // ── Bullets ──
    let tracerColor = 0xfff4e2;
    function setTracerColor(c) { tracerColor = c; }
    function makeBullet(dir, hot) {
        const m = new THREE.Mesh(geo('tracer', () => { const g = new THREE.BoxGeometry(0.07, 0.07, 1.4); return g; }),
            basicMat(hot ? 0xffffff : tracerColor, { fog: false }));
        m.lookAt(m.position.clone().add(dir));
        m.userData.orientTo = dir;
        return m;
    }
    function makeEnemyBullet(big) {
        const r = big ? 0.24 : 0.16;
        const m = new THREE.Mesh(geo('ebul' + r, () => new THREE.SphereGeometry(r, 10, 8)), basicMat(0xff4a2a));
        const o = new THREE.Mesh(geo('ebulO' + r, () => new THREE.SphereGeometry(r * 1.6, 10, 8)), basicMat(0xffc9a8, { transparent: true, opacity: 0.45, depthWrite: false }));
        m.add(o);
        return m;
    }
    function makeRocket() {
        const m = new THREE.Mesh(geo('rocket', () => new THREE.CylinderGeometry(0.15, 0.15, 0.8, 8)), toonMat(0xffc857));
        outline(m, 1.25);
        return m;
    }
    // ── Pickups (Golden Hour Toon) ──
    // Each pickup is an empty carrier mesh (owns the theme colour, so the game's
    // d.mesh.material.color keeps working for impacts) holding a spinning,
    // bobbing toon model with ink outlines and a soft ring on the ground.
    const DROP_COL = { hp: 0xf2545b, ammo: 0xe9a93f, secondary: 0xd9925f, speed: 0xb98cf0, shield: 0x8cc8f5, rapid: 0xff9f4a, overclock: 0xffd25e };
    function extrude(key, pts, depth, bevel) {
        return geo(key, () => {
            const sh = new THREE.Shape();
            pts.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
            sh.closePath();
            const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
            g.center();
            return g;
        });
    }
    function makeDrop(kind) {
        const col = DROP_COL[kind] || PAL.cream;
        const root = new THREE.Mesh(geo('empty', () => {
            const g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
            g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.01);
            return g;
        }), basicMat(col));
        root.frustumCulled = false;
        const spin = new THREE.Group();
        root.add(spin);
        const main = toonMat(col, { emissive: col, emissiveIntensity: 0.22 });
        const cream = toonMat(PAL.cream, { emissive: PAL.cream, emissiveIntensity: 0.12 });
        const ink = toonMat(PAL.ink);
        const add = (parent, g, m, x, y, z, o) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.castShadow = true; if (o) outline(me, o); parent.add(me); return me; };
        if (kind === 'hp') {                       // cream medkit, red cross both sides, ink handle
            add(spin, geo('dkHp', () => new THREE.BoxGeometry(0.78, 0.56, 0.36)), cream, 0, 0, 0, 1.1);
            const lid = add(spin, geo('dkHpLid', () => new THREE.BoxGeometry(0.82, 0.1, 0.4)), main, 0, 0.2, 0);
            lid.castShadow = false;
            add(spin, geo('dkHpHdl', () => new THREE.TorusGeometry(0.13, 0.035, 6, 14, Math.PI)), ink, 0, 0.3, 0);
            for (const sz of [-1, 1]) {            // bars at different depths: no coplanar faces
                add(spin, geo('dkHpX1', () => new THREE.BoxGeometry(0.34, 0.1, 0.05)), main, 0, -0.06, sz * 0.19);
                add(spin, geo('dkHpX2', () => new THREE.BoxGeometry(0.1, 0.34, 0.07)), main, 0, -0.06, sz * 0.19);
            }
        } else if (kind === 'ammo') {               // chunky mustard ammo box with brass rounds on top
            add(spin, geo('dkAm', () => new THREE.BoxGeometry(0.74, 0.42, 0.46)), main, 0, -0.06, 0, 1.1);
            add(spin, geo('dkAmBand', () => new THREE.BoxGeometry(0.76, 0.1, 0.48)), cream, 0, -0.04, 0);
            const brass = toonMat(0xffd58a, { emissive: 0xffd58a, emissiveIntensity: 0.15 });
            for (const bx of [-0.2, 0, 0.2]) {
                add(spin, geo('dkAmB', () => new THREE.CylinderGeometry(0.065, 0.065, 0.2, 10)), brass, bx, 0.24, 0);
                add(spin, geo('dkAmT', () => new THREE.ConeGeometry(0.065, 0.12, 10)), ink, bx, 0.4, 0);
            }
        } else if (kind === 'secondary') {          // wooden rocket crate with a rocket strapped on top
            add(spin, geo('dkRkC', () => new THREE.BoxGeometry(0.9, 0.36, 0.56)), main, 0, -0.1, 0, 1.08);
            for (const px of [-0.3, 0.3]) add(spin, geo('dkRkS', () => new THREE.BoxGeometry(0.07, 0.38, 0.58)), ink, px, -0.1, 0);
            const r = new THREE.Group(); r.position.set(0, 0.2, 0); r.rotation.z = Math.PI / 2; spin.add(r);
            add(r, geo('dkRkB', () => new THREE.CylinderGeometry(0.1, 0.1, 0.6, 12)), cream, 0, 0, 0, 1.12);
            add(r, geo('dkRkN', () => new THREE.ConeGeometry(0.1, 0.2, 12)), toonMat(DROP_COL.hp), 0, 0.4, 0);
            for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
                const f = add(r, geo('dkRkF', () => new THREE.BoxGeometry(0.03, 0.14, 0.12)), ink, Math.sin(a) * 0.12, -0.26, Math.cos(a) * 0.12);
                f.rotation.y = a;
            }
        } else if (kind === 'speed') {               // lightning bolt
            add(spin, extrude('dkSp', [[0.08, 0.5], [-0.24, 0.0], [-0.02, 0.0], [-0.12, -0.5], [0.24, 0.08], [0.02, 0.08]], 0.14, 0.03), main, 0, 0, 0, 1.1);
        } else if (kind === 'shield') {              // shield badge with a cream inner plate
            const pts = [[0, 0.42], [0.34, 0.3], [0.32, -0.04], [0, -0.42], [-0.32, -0.04], [-0.34, 0.3]];
            add(spin, extrude('dkSh', pts, 0.12, 0.03), main, 0, 0, 0, 1.1);
            for (const sz of [-1, 1]) add(spin, extrude('dkShIn', pts.map(p => [p[0] * 0.55, p[1] * 0.55]), 0.04, 0.01), cream, 0, 0, sz * 0.1);
        } else if (kind === 'rapid') {               // triple chevron (fast fire)
            const chev = [[-0.3, 0.12], [0, -0.14], [0.3, 0.12], [0.3, 0.26], [0, 0.0], [-0.3, 0.26]];
            for (const cy of [-0.22, 0, 0.22]) add(spin, extrude('dkRp', chev, 0.12, 0.025), main, 0, cy + 0.06, 0, 1.12);
        } else {                                     // overclock: chunky star
            const pts = [];
            for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 0.2 : 0.46; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
            add(spin, extrude('dkOc', pts, 0.14, 0.03), main, 0, 0, 0, 1.1);
            for (const sz of [-1, 1]) add(spin, geo('dkOcC', () => new THREE.CircleGeometry(0.09, 16)), cream, 0, 0.02, sz * 0.105).rotation.y = sz < 0 ? Math.PI : 0;
        }
        // soft ground ring (drops sit at y = 0.8 in the game; the ring lies on the ground)
        const ring = new THREE.Mesh(geo('dkRing', () => new THREE.RingGeometry(0.42, 0.56, 40).rotateX(-Math.PI / 2)),
            basicMat(col, { transparent: true, opacity: 0.55, depthWrite: false }));
        ring.position.y = -0.76; ring.renderOrder = 2;
        const glow = new THREE.Mesh(geo('dkGlow', () => new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2)),
            basicMat(PAL.cream, { transparent: true, opacity: 0.22, depthWrite: false }));
        glow.position.y = -0.77; glow.renderOrder = 1;
        root.add(ring, glow);
        root.userData.drop = { spin, ring, phase: Math.random() * 6.28 };
        return root;
    }
    // gentle bob + spin, ring breathes; called every frame for each drop
    function animateDrop(m, now) {
        const d = m.userData.drop; if (!d) return;
        const t = now * 0.001 + d.phase;
        d.spin.rotation.y = t * 1.6;
        d.spin.position.y = Math.sin(t * 2.4) * 0.12;
        d.spin.rotation.z = Math.sin(t * 1.3) * 0.08;
        const s = 1 + Math.sin(t * 2.4) * 0.08;
        d.ring.scale.set(s, 1, s);
    }

    // ── Paper confetti (one instanced draw call) ──
    const MAXC = 420;
    let conf = null, confData = [], confNext = 0;
    const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
    let rings = [];
    let flashMesh = null;
    function buildFX() {
        const g = new THREE.PlaneGeometry(0.26, 0.17);
        const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        conf = new THREE.InstancedMesh(g, m, MAXC);
        conf.frustumCulled = false;
        conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        confData = [];
        for (let i = 0; i < MAXC; i++) {
            confData.push({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), rv: new THREE.Vector3(), sc: 1, ground: false });
            _m4.makeScale(0, 0, 0); conf.setMatrixAt(i, _m4);
            conf.setColorAt(i, _c.set(0xffffff));
        }
        scene.add(conf);
        rings = [];
        for (let i = 0; i < 6; i++) {
            const r = new THREE.Mesh(geo('ring', () => new THREE.RingGeometry(0.8, 1.0, 40)), new THREE.MeshBasicMaterial({ color: PAL.cream, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
            r.visible = false; r.userData.t = 1;
            scene.add(r); rings.push(r);
        }
    }
    const PALETTE_MAP = { enemy: [PAL.accent, PAL.accent, 0xff8a5c, PAL.cream], dust: [0xe8cfb2, 0xd9b796, 0xf5e6d3], player: [0xff5a3c, 0xffb199], pickup: null };
    // kind: 'enemy' | 'dust' | 'player' | numeric colour
    function burst(pos, kind, count, power = 1) {
        if (!conf) return;
        const cols = typeof kind === 'number' ? [kind, PAL.cream] : (PALETTE_MAP[kind] || PALETTE_MAP.dust);
        for (let i = 0; i < count; i++) {
            const d = confData[confNext]; const idx = confNext;
            confNext = (confNext + 1) % MAXC;
            d.p.copy(pos);
            const a = Math.random() * Math.PI * 2, up = 0.35 + Math.random() * 0.9;
            const sp = (3 + Math.random() * 6) * power;
            d.v.set(Math.cos(a) * sp * 0.8, up * sp, Math.sin(a) * sp * 0.8);
            d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
            d.rv.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
            d.max = d.life = 1.2 + Math.random() * 1.4;
            d.sc = (0.6 + Math.random() * 0.8) * (power > 1.5 ? 1.5 : 1);
            d.ground = false;
            conf.setColorAt(idx, _c.set(cols[(Math.random() * cols.length) | 0]));
        }
        conf.instanceColor.needsUpdate = true;
    }
    function ringPop(pos, scale = 1, color) {
        const r = rings.find(x => !x.visible) || rings[0];
        r.position.set(pos.x, Math.max(0.15, pos.y), pos.z);
        r.userData.t = 0; r.userData.scale = scale;
        r.material.color.set(color || PAL.cream);
        r.visible = true;
    }

    // ── Gun viewmodel ──
    let gun = null, gunAccentMat = null, gunKick = 0, gunFlashT = 0;
    // Each operative carries its own gun silhouette (same parts kit, different
    // proportions) so picking an operative visibly changes what you hold.
    function addGunParts(g, op, accentM) {
        const bodyM = toonMat(0x6a5560), darkM = toonMat(0x3a2b33), railM = toonMat(0xf3e6d6);
        const add = (gm, m, x, y, z, o) => { const me = new THREE.Mesh(gm, m); me.position.set(x, y, z); if (o) outline(me, o); g.add(me); return me; };
        let muzzleZ = -0.52;
        if (op === 'enforcer') {            // pump shotgun: chunky body, twin barrels, wooden-ish pump
            add(new THREE.BoxGeometry(0.15, 0.15, 0.5), bodyM, 0, 0, 0, 1.06);
            add(new THREE.CylinderGeometry(0.034, 0.034, 0.42, 10).rotateX(Math.PI / 2), darkM, -0.035, 0.03, -0.42);
            add(new THREE.CylinderGeometry(0.034, 0.034, 0.42, 10).rotateX(Math.PI / 2), darkM, 0.035, 0.03, -0.42);
            add(new THREE.BoxGeometry(0.13, 0.07, 0.18), accentM, 0, -0.045, -0.36, 1.08);
            add(new THREE.BoxGeometry(0.1, 0.2, 0.11), darkM, 0, -0.15, 0.13).rotation.x = -0.3;
            add(new THREE.BoxGeometry(0.16, 0.035, 0.32), accentM, 0, 0.09, 0.02);
            muzzleZ = -0.66;
        } else if (op === 'phantom') {      // SMG: slim body, long curved mag, stubby barrel, stock
            add(new THREE.BoxGeometry(0.1, 0.12, 0.4), bodyM, 0, 0, 0, 1.06);
            add(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 10).rotateX(Math.PI / 2), darkM, 0, 0.015, -0.28);
            add(new THREE.BoxGeometry(0.06, 0.26, 0.08), accentM, 0, -0.17, -0.06).rotation.x = 0.25;
            add(new THREE.BoxGeometry(0.08, 0.17, 0.09), darkM, 0, -0.12, 0.12).rotation.x = -0.2;
            add(new THREE.BoxGeometry(0.05, 0.06, 0.22), railM, 0, 0, 0.28);
            add(new THREE.BoxGeometry(0.11, 0.03, 0.26), accentM, 0, 0.07, -0.02);
            muzzleZ = -0.4;
        } else if (op === 'medic') {        // compact sidearm with a cream cross badge
            add(new THREE.BoxGeometry(0.11, 0.13, 0.34), bodyM, 0, 0, 0, 1.06);
            add(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 10).rotateX(Math.PI / 2), darkM, 0, 0.015, -0.23);
            add(new THREE.BoxGeometry(0.09, 0.2, 0.1), darkM, 0, -0.14, 0.08).rotation.x = -0.25;
            add(new THREE.BoxGeometry(0.125, 0.045, 0.24), accentM, 0, 0.078, -0.01);
            add(new THREE.BoxGeometry(0.02, 0.09, 0.03), railM, 0.066, 0, -0.04);
            add(new THREE.BoxGeometry(0.03, 0.03, 0.09), railM, 0.071, 0, -0.04);
            muzzleZ = -0.34;
        } else {                            // striker: the balanced rifle-pistol
            add(new THREE.BoxGeometry(0.12, 0.13, 0.46), bodyM, 0, 0, 0, 1.06);
            add(new THREE.BoxGeometry(0.135, 0.04, 0.3), accentM, 0, 0.075, -0.02);
            add(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10).rotateX(Math.PI / 2), darkM, 0, 0.015, -0.34);
            add(new THREE.BoxGeometry(0.09, 0.2, 0.1), darkM, 0, -0.14, 0.12).rotation.x = -0.25;
            add(new THREE.BoxGeometry(0.07, 0.16, 0.08), accentM, 0, -0.13, -0.08);
            add(new THREE.BoxGeometry(0.04, 0.05, 0.04), railM, 0, 0.1, 0.16);
            add(new THREE.BoxGeometry(0.125, 0.03, 0.2), railM, 0, -0.058, -0.12);
        }
        return muzzleZ;
    }
    function buildGun() {
        gun = new THREE.Group();
        gunAccentMat = new THREE.MeshToonMaterial({ color: tracerColor, gradientMap: getRamp() });
        const op = (typeof selectedChar !== 'undefined' && selectedChar) || 'striker';
        const muzzleZ = addGunParts(gun, op, gunAccentMat);
        gun.children.forEach(c => { c.renderOrder = 5; });
        flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: getFlashTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        flashMesh.position.set(0, 0.015, muzzleZ);
        flashMesh.visible = false;
        gun.add(flashMesh);
        gun.scale.setScalar(0.5);
        gun.position.set(0.19, -0.18, -0.42);
        camera.add(gun);
        scene.add(camera);
    }

    // Codex preview figure for an operative: a friendly cream toon character in
    // the operative's colour, holding that operative's gun.
    const OP_COLORS = { striker: 0x7cc3d6, enforcer: 0xc6a2f0, phantom: 0xffc857, medic: 0x7fd6a4 };
    function makeOperative(op) {
        const col = OP_COLORS[op] || 0x7cc3d6;
        const bulk = op === 'enforcer' ? 1.25 : op === 'phantom' ? 0.88 : 1;
        const root = new THREE.Group();
        const suit = toonMat(col), cream = toonMat(PAL.cream), ink = toonMat(PAL.ink);
        const body = new THREE.Mesh(geo('opBody' + bulk, () => new THREE.CylinderGeometry(0.36 * bulk, 0.42 * bulk, 0.9, 14)), suit);
        body.position.y = 0.75; outline(body, 1.08); root.add(body);
        const belt = new THREE.Mesh(geo('opBelt' + bulk, () => new THREE.CylinderGeometry(0.45 * bulk, 0.45 * bulk, 0.1, 14)), ink);
        belt.position.y = 0.42; root.add(belt);
        const head = new THREE.Mesh(geo('opHead', () => new THREE.SphereGeometry(0.3, 18, 14)), cream);
        head.position.y = 1.45; outline(head, 1.08); root.add(head);
        const visor = new THREE.Mesh(geo('opVisor', () => new THREE.BoxGeometry(0.46, 0.13, 0.2)), ink);
        visor.position.set(0, 1.48, 0.21); root.add(visor);
        const shine = new THREE.Mesh(geo('opShine', () => new THREE.BoxGeometry(0.1, 0.035, 0.02)), basicMat(col));
        shine.position.set(-0.1, 1.5, 0.315); root.add(shine);
        if (op === 'medic') {
            const c1 = new THREE.Mesh(geo('opX1', () => new THREE.BoxGeometry(0.22, 0.07, 0.04)), cream);
            const c2 = new THREE.Mesh(geo('opX2', () => new THREE.BoxGeometry(0.07, 0.22, 0.06)), cream);
            c1.position.set(0, 0.85, 0.42 * bulk); c2.position.set(0, 0.85, 0.42 * bulk); root.add(c1, c2);
        }
        if (op === 'enforcer') {
            for (const sx of [-1, 1]) {
                const pad = new THREE.Mesh(geo('opPad', () => new THREE.BoxGeometry(0.28, 0.2, 0.42)), cream);
                pad.position.set(sx * 0.6, 1.16, 0); outline(pad, 1.1); root.add(pad);
            }
        }
        if (op === 'phantom') {
            const hood = new THREE.Mesh(geo('opHood', () => new THREE.ConeGeometry(0.34, 0.36, 14)), suit);
            hood.position.y = 1.78; outline(hood, 1.08); root.add(hood);
        }
        if (op === 'striker') {
            const ant = new THREE.Mesh(geo('opAnt', () => new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5)), ink);
            ant.position.set(0.18, 1.8, -0.05); root.add(ant);
        }
        for (const lx of [-0.15, 0.15]) {
            const leg = new THREE.Mesh(geo('opLeg', () => new THREE.BoxGeometry(0.17, 0.32, 0.22)), ink);
            leg.position.set(lx * bulk, 0.16, 0); root.add(leg);
        }
        const g = new THREE.Group();
        addGunParts(g, op, toonMat(col));
        g.scale.setScalar(1.15);
        g.rotation.y = Math.PI;            // muzzle toward the viewer like the figure
        g.position.set(0.5 * bulk, 0.8, 0.62 * bulk);   // clear of the body (it used to clip into the torso)
        root.add(g);
        // a stubby arm from the shoulder to the grip, so the gun is held, not floating
        const a0 = new THREE.Vector3(0.33 * bulk, 1.08, 0.08), a1 = new THREE.Vector3(0.5 * bulk, 0.68, 0.47 * bulk);
        const len = a0.distanceTo(a1);
        const arm = new THREE.Mesh(geo('opArm' + bulk, () => new THREE.CylinderGeometry(0.075, 0.075, len, 10)), suit);
        arm.position.copy(a0).add(a1).multiplyScalar(0.5);
        arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a1.clone().sub(a0).normalize());
        outline(arm, 1.12); root.add(arm);
        const hand = new THREE.Mesh(geo('opHand', () => new THREE.SphereGeometry(0.085, 10, 8)), cream);
        hand.position.copy(a1); root.add(hand);
        root.userData.op = op;
        return root;
    }
    function setGunSkin(c) { tracerColor = c; if (gunAccentMat) gunAccentMat.color.set(c); }
    function gunFire(power = 1) {
        gunKick = Math.min(1.4, gunKick + 0.6 * power);
        gunFlashT = 0.06;
        if (flashMesh) { flashMesh.visible = true; flashMesh.rotation.z = Math.random() * Math.PI; flashMesh.scale.setScalar(0.8 + Math.random() * 0.5 * power); }
    }

    // ── Per-frame ──
    let lastT = performance.now();
    function update() {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
        if (sky) sky.position.copy(camera.position);
        if (sun && player) {
            sun.position.set(player.position.x + SUN_DIR.x * 90, SUN_DIR.y * 90, player.position.z + SUN_DIR.z * 90);
            sun.target.position.set(player.position.x, 0, player.position.z);
        }
        // confetti
        if (conf) {
            let dirty = false;
            for (let i = 0; i < MAXC; i++) {
                const d = confData[i];
                if (d.life <= 0) continue;
                dirty = true;
                d.life -= dt;
                if (!d.ground) {
                    d.v.y -= 9.8 * dt * 0.9;
                    d.v.multiplyScalar(1 - 2.2 * dt);           // paper drag
                    d.p.addScaledVector(d.v, dt);
                    d.p.x += Math.sin(now * 0.006 + i) * dt * 0.6;  // flutter
                    d.r.addScaledVector(d.rv, dt);
                    if (d.p.y < 0.03) { d.p.y = 0.03; d.ground = true; d.r.x = -Math.PI / 2; d.r.y = 0; }
                }
                const k = d.life <= 0 ? 0 : Math.min(1, d.life / 0.35) * d.sc;
                _e.set(d.r.x, d.r.y, d.r.z); _q.setFromEuler(_e); _s.set(k, k, k);
                _m4.compose(d.p, _q, _s);
                conf.setMatrixAt(i, _m4);
            }
            if (dirty) conf.instanceMatrix.needsUpdate = true;
        }
        for (const r of rings) {
            if (!r.visible) continue;
            r.userData.t += dt * 2.6;
            const t = r.userData.t;
            if (t >= 1) { r.visible = false; continue; }
            r.scale.setScalar((0.4 + t * 3.2) * (r.userData.scale || 1));
            r.material.opacity = (1 - t) * 0.85;
            r.lookAt(camera.position);
        }
        // gun
        if (gun) {
            gunKick = Math.max(0, gunKick - dt * 7);
            const moving = (typeof joystick !== 'undefined' && joystick.active) || keys['w'] || keys['a'] || keys['s'] || keys['d'];
            const bob = moving ? Math.sin(bobTime * 1.0) * 0.012 : 0;
            const rel = isReloading ? 1 : 0;
            gun.userData.rel = (gun.userData.rel || 0) + (rel - (gun.userData.rel || 0)) * Math.min(1, dt * 12);
            const R = gun.userData.rel;
            gun.position.set(0.19 + bob * 0.5, -0.18 + Math.abs(bob) - R * 0.08, -0.42 + gunKick * 0.04);
            gun.rotation.set(gunKick * 0.12 + R * 0.6, 0, R * 0.5);
            if (gunFlashT > 0) { gunFlashT -= dt; if (gunFlashT <= 0 && flashMesh) flashMesh.visible = false; }
        }
        const nowMs = now;
        for (const e of enemies) animateEnemy(e, nowMs);
    }

    return { PAL, OP_COLORS, buildWorld, makeEnemy, makeOperative, isHeadshot, makeBullet, makeEnemyBullet, makeRocket, makeDrop, animateDrop, DROP_COL, burst, ringPop, gunFire, setGunSkin, setTracerColor, update, toonMat };
})();
