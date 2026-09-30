// ── js/audio.js ──
// High-energy procedural Web Audio synthesizer for MOOD SHIFT CITY.
// Layered waveforms, punchy transient impacts, and arcade feedback — zero external audio files.

const AudioEngine = (() => {
    let ctx = null;
    let masterGain = null;

    function getContext() {
        if (!ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                ctx = new AudioCtx();
                masterGain = ctx.createGain();
                masterGain.connect(ctx.destination);
                updateVolume();
            }
        }
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
        return ctx;
    }

    function updateVolume() {
        if (!masterGain || !ctx) return;
        const vol = (typeof settings !== 'undefined' && settings.masterVolume != null)
            ? settings.masterVolume / 100
            : 0.8;
        masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), ctx.currentTime);
    }

    // Unlock on first user touch / key / click
    function unlock() {
        const c = getContext();
        if (c && c.state === 'suspended') {
            c.resume().catch(() => {});
        }
        ['click', 'keydown', 'touchstart'].forEach(evt => {
            window.removeEventListener(evt, unlock, true);
        });
    }
    ['click', 'keydown', 'touchstart'].forEach(evt => {
        window.addEventListener(evt, unlock, { once: true, capture: true, passive: true });
    });

    // Helper: Noise buffer for gunshot transients & explosions
    let noiseBuffer = null;
    function getNoiseBuffer(c) {
        if (!noiseBuffer) {
            const bufferSize = c.sampleRate * 1.5;
            noiseBuffer = c.createBuffer(1, bufferSize, c.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        return noiseBuffer;
    }

    return {
        get context() { return getContext(); },
        updateVolume,

        // ── UI Sounds ──
        playUIClick() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1400, now);
            osc.frequency.exponentialRampToValueAtTime(700, now + 0.04);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.05);
        },

        playUIHover() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2200, now);
            osc.frequency.exponentialRampToValueAtTime(3200, now + 0.03);
            gain.gain.setValueAtTime(0.06, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.035);
        },

        // ── Weapons ──
        playShoot(pitchMod = 1) {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;

            // Transient kick oscillator
            const osc = c.createOscillator();
            const oscGain = c.createGain();
            osc.type = 'sawtooth';
            const baseFreq = 380 * pitchMod;
            osc.frequency.setValueAtTime(baseFreq * 1.8, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.09);
            oscGain.gain.setValueAtTime(0.24, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.connect(oscGain);
            oscGain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.11);

            // Punchy white noise burst with bandpass
            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1800, now);
            filter.Q.setValueAtTime(2.0, now);
            const noiseGain = c.createGain();
            noiseGain.gain.setValueAtTime(0.22, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(masterGain);
            noise.start(now);
            noise.stop(now + 0.08);
        },

        playReload() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Mechanical double click-clack
            [0, 0.12].forEach((delay, idx) => {
                const t = now + delay;
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(idx === 0 ? 320 : 640, t);
                osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 160 : 420, t + 0.05);
                gain.gain.setValueAtTime(0.12, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(t);
                osc.stop(t + 0.06);
            });
        },

        playSecondary() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Rocket ignition whoosh & sub
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.linearRampToValueAtTime(450, now + 0.15);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.5);
        },

        // ── Hits, Kills, Combos ──
        playHit() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Crisp percussive hitmarker blip
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1600, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.04);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.05);
        },

        playHeadshot() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Sparkly dual harmonic ping
            [1900, 2800].forEach((freq) => {
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(now);
                osc.stop(now + 0.1);
            });
        },

        playKill(combo = 1) {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            const pitchBonus = Math.min(6, combo - 1) * 60;

            // Sub punch
            const sub = c.createOscillator();
            const subGain = c.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(180, now);
            sub.frequency.exponentialRampToValueAtTime(45, now + 0.22);
            subGain.gain.setValueAtTime(0.35, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
            sub.connect(subGain);
            subGain.connect(masterGain);
            sub.start(now);
            sub.stop(now + 0.25);

            // Arcade kill confirmation bell
            const bell = c.createOscillator();
            const bellGain = c.createGain();
            bell.type = 'triangle';
            bell.frequency.setValueAtTime(540 + pitchBonus, now + 0.02);
            bell.frequency.exponentialRampToValueAtTime(780 + pitchBonus, now + 0.12);
            bellGain.gain.setValueAtTime(0.22, now + 0.02);
            bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
            bell.connect(bellGain);
            bellGain.connect(masterGain);
            bell.start(now + 0.02);
            bell.stop(now + 0.18);
        },

        playCritical() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.18);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.22);
        },

        playExplosion(large = false) {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;

            // Sub rumble
            const sub = c.createOscillator();
            const subGain = c.createGain();
            sub.type = 'sawtooth';
            sub.frequency.setValueAtTime(large ? 90 : 120, now);
            sub.frequency.exponentialRampToValueAtTime(30, now + (large ? 0.7 : 0.4));
            subGain.gain.setValueAtTime(large ? 0.45 : 0.28, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + (large ? 0.75 : 0.45));
            sub.connect(subGain);
            subGain.connect(masterGain);
            sub.start(now);
            sub.stop(now + (large ? 0.8 : 0.5));

            // Noise blast
            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(large ? 800 : 1200, now);
            filter.frequency.linearRampToValueAtTime(150, now + (large ? 0.6 : 0.35));
            const noiseGain = c.createGain();
            noiseGain.gain.setValueAtTime(large ? 0.5 : 0.3, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + (large ? 0.65 : 0.4));
            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(masterGain);
            noise.start(now);
            noise.stop(now + (large ? 0.7 : 0.45));
        },

        playBomberBoom() {
            this.playExplosion(true);
        },

        playDamage() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Heavy distorted punch
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.3);
        },

        playPickup() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Rapid arcade chirp
            [900, 1350].forEach((freq, idx) => {
                const t = now + idx * 0.05;
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(t);
                osc.stop(t + 0.1);
            });
        },

        playBoost() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Rising synth powerup
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(1600, now + 0.28);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.32);
        },

        // ── Wave & Boss Events ──
        playWaveComplete() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Triumphant cyber triad synth arpeggio: C5 - E5 - G5 - C6
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const t = now + idx * 0.08;
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.22, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(t);
                osc.stop(t + 0.28);
            });
        },

        playBossWarning() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Deep ominous horn / sub pulse
            [55, 110].forEach((freq) => {
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.linearRampToValueAtTime(freq * 0.85, now + 0.8);
                gain.gain.setValueAtTime(0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(now);
                osc.stop(now + 0.9);
            });
        },

        playLevelUp() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Glorious ascending fanfare
            const notes = [440, 554.37, 659.25, 880, 1108.73];
            notes.forEach((freq, idx) => {
                const t = now + idx * 0.09;
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.24, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(t);
                osc.stop(t + 0.38);
            });
        },

        playGameOver() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Dark descending pitch drop
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.8);
            gain.gain.setValueAtTime(0.35, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.9);
        },

        // ── NEXUS AI Sounds ──
        playNexusActivate() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Rising dual high-tech digital chirps
            [880, 1320, 1760].forEach((freq, idx) => {
                const t = now + idx * 0.05;
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.12, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(t);
                osc.stop(t + 0.09);
            });
        },

        playTrainingStart() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Hyperdrive charge tone
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(1800, now + 0.4);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.45);
        },

        playTrainingStop() {
            const c = getContext(); if (!c) return;
            const now = c.currentTime;
            // Power-down release
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(900, now);
            osc.frequency.exponentialRampToValueAtTime(120, now + 0.3);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.35);
        }
    };
})();

// Re-map the legacy Sound object so all existing calls automatically use the rich new engine
if (typeof Sound !== 'undefined') {
    Sound.shoot       = () => AudioEngine.playShoot();
    Sound.explode     = () => AudioEngine.playExplosion(false);
    Sound.pickup      = () => AudioEngine.playPickup();
    Sound.reload      = () => AudioEngine.playReload();
    Sound.wave        = () => AudioEngine.playWaveComplete();
    Sound.hit         = () => AudioEngine.playDamage();
    Sound.boost       = () => AudioEngine.playBoost();
    Sound.bomberBoom  = () => AudioEngine.playBomberBoom();
    Sound.secondary   = () => AudioEngine.playSecondary();
    Sound.boss        = () => AudioEngine.playBossWarning();
    Sound.achievement = () => AudioEngine.playLevelUp();
    Sound.rankUp      = () => AudioEngine.playLevelUp();
}
