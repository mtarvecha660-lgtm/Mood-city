// ── js/state.js ──
// Shared game state and constants. All other modules read/write these globals.

// Three.js objects
let scene, camera, renderer, player;

// Entity arrays
let enemies = [], bullets = [], enemyBullets = [], buildings = [], drops = [], particles = [];

// Player stats
let hp = 100, score = 0, keys = {}, gameRunning = false;
let yaw = 0, pitch = 0, lastShotTime = 0, shakeAmount = 0;
let isMobile = false;
let damageFlashAmount = 0, muzzleFlashAmount = 0, chromaAmount = 0;

// Weapon
let ammo = 12, maxClip = 12, reserve = 48, isReloading = false;
const MAX_RESERVE = 120;

// Secondary weapon (rocket)
let hasSecondaryWeapon = false, secondaryAmmo = 0;

// Wave system
let wave = 0, enemiesToSpawn = 0, isWaveTransition = false;
let gamePaused = false;
let tutorialMode = false;

// Boss
let isBossWave = false;

// Difficulty  'standard' | 'veteran' | 'ghost'
let difficultyMode = 'standard';

// Wave modifier  null | 'blitz' | 'siege' | 'armored' | 'swarm'
let currentWaveModifier = null;

// Combo system
let comboCount = 0, comboMultiplier = 1, comboDecayTimer = null;

// Run stats
let killCount = 0, shotsFired = 0, shotsHit = 0, runStartTime = 0;
let runSpeedPickups = 0, waveDamageTaken = 0, waveStartHp = 100;

// Kill feed
let killFeedEntries = [];

// View bob
let bobTime = 0;

// Building lights for dynamic pulsing
let buildingLights = [];

// High score
let highScore = parseInt(localStorage.getItem('msc_highscore') || '0');

// ── Character build ──
let selectedChar  = 'striker';
let playerSpeed   = 0.2;
let playerMaxHp   = 100;
let shootCooldown = 150;
let bulletDmg     = 50;
let burstCount    = 1;

// ── Active powerup boosts ──
let boosts = {};

// Constants
const MAX_PARTICLES = 100;
const PARTICLE_SIZE = 0.25;

// ── Rank / XP system ──
let playerXP = parseInt(localStorage.getItem('msc_xp') || '0');
const RANKS = [
    { name: 'ROOKIE',     xp: 0     },
    { name: 'OPERATIVE',  xp: 500   },
    { name: 'SPECIALIST', xp: 1500  },
    { name: 'VETERAN',    xp: 3500  },
    { name: 'GHOST',      xp: 7500  },
    { name: 'LEGEND',     xp: 15000 }
];
function getPlayerRank(xp) {
    xp = (xp !== undefined) ? xp : playerXP;
    let rank = RANKS[0];
    for (let r of RANKS) { if (xp >= r.xp) rank = r; }
    return rank;
}
function getNextRank(xp) {
    xp = (xp !== undefined) ? xp : playerXP;
    for (let r of RANKS) { if (xp < r.xp) return r; }
    return null;
}

// ── Achievements ──
const ACHIEVEMENT_DEFS = [
    { id: 'first_blood',  name: 'FIRST BLOOD',  desc: 'Kill your first enemy' },
    { id: 'flawless',     name: 'FLAWLESS',      desc: 'Complete a wave without taking damage' },
    { id: 'speed_demon',  name: 'SPEED DEMON',   desc: 'Collect 3 Speed+ in one run' },
    { id: 'centurion',    name: 'CENTURION',     desc: 'Kill 100 enemies in one run' },
    { id: 'executioner',  name: 'EXECUTIONER',   desc: 'Kill 500 enemies total' },
    { id: 'boss_slayer',  name: 'BOSS SLAYER',   desc: 'Defeat your first boss' },
    { id: 'combo_master', name: 'COMBO MASTER',  desc: 'Reach a ×4 kill combo' },
];
let unlockedAchievements = JSON.parse(localStorage.getItem('msc_achievements') || '[]');
let totalEnemiesKilled = parseInt(localStorage.getItem('msc_total_kills') || '0');

// ── Persistent settings ──
const settings = {
    masterVolume:         parseInt(localStorage.getItem('msc_vol')    ?? '80'),
    gyroEnabled:          localStorage.getItem('msc_gyro')   === 'true',
    gyroSensitivity:      parseInt(localStorage.getItem('msc_gyroS') ?? '10'),
    lookSensitivity:      parseInt(localStorage.getItem('msc_lookS') ?? '7'),
    aiTrainButtonVisible: localStorage.getItem('msc_aiTrainBtn') !== 'false'
};
function saveSettings() {
    localStorage.setItem('msc_vol',        settings.masterVolume);
    localStorage.setItem('msc_gyro',       settings.gyroEnabled);
    localStorage.setItem('msc_gyroS',      settings.gyroSensitivity);
    localStorage.setItem('msc_lookS',      settings.lookSensitivity);
    localStorage.setItem('msc_aiTrainBtn', settings.aiTrainButtonVisible);
}

// ── Audio ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const Sound = {
    play(freq, type, duration, vol) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const scaledVol = vol * (settings.masterVolume / 100);
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(scaledVol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + duration);
    },
    shoot()       { this.play(400,  'square',   0.1,  0.05); },
    explode()     { this.play(60,   'sawtooth', 0.5,  0.12); },
    pickup()      { this.play(900,  'sine',     0.2,  0.1);  },
    reload()      { this.play(250,  'triangle', 0.2,  0.04); },
    wave()        { this.play(600,  'sine',     0.6,  0.08); },
    hit()         { this.play(150,  'sawtooth', 0.15, 0.08); },
    boost()       { this.play(1200, 'sine',     0.3,  0.06); },
    bomberBoom()  { this.play(40, 'sawtooth', 0.9, 0.18); this.play(80, 'sine', 0.6, 0.12); },
    secondary()   { this.play(200, 'sawtooth', 0.25, 0.14); this.play(80, 'sawtooth', 0.6, 0.16); },
    boss()        { this.play(60,  'sawtooth', 0.7,  0.15); },
    achievement() {
        this.play(600, 'sine', 0.15, 0.06);
        setTimeout(() => this.play(800,  'sine', 0.15, 0.06), 100);
        setTimeout(() => this.play(1000, 'sine', 0.2,  0.08), 220);
    },
    rankUp() {
        this.play(440, 'sine', 0.25, 0.06);
        setTimeout(() => this.play(550, 'sine', 0.25, 0.06), 120);
        setTimeout(() => this.play(660, 'sine', 0.25, 0.06), 240);
        setTimeout(() => this.play(880, 'sine', 0.35, 0.08), 380);
    }
};
