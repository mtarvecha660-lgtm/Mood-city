# Mood Shift City: Ultra Vis

> Urban Combat Protocol v4.2 — High-Vis Protocol Enabled

A browser-based first-person shooter built with vanilla HTML, CSS, and JavaScript using Three.js. No install, no build step — just open and play.

---

## Controls

| Input | Action |
|-------|--------|
| `W A S D` | Move |
| Mouse | Aim |
| Left Click | Shoot |
| `R` | Reload |
| `F` | Fire rocket (when you have one) |
| `ESC` | Pause / Resume |

**On mobile:** left thumb joystick to move, right thumb drag to aim, on-screen buttons to shoot, reload, and fire rockets. Rotate your device to landscape to play.

---

## Pick Your Operative

Choose before you deploy. Each plays very differently.

| Operative | Feel | HP | Special |
|-----------|------|----|---------|
| **STRIKER** | Balanced — good at everything | 100 | Best starting choice |
| **ENFORCER** | Slow tank | 160 | Fires 3 bullets per shot (shotgun burst) |
| **PHANTOM** | Ultra fast and fragile | 70 | Fastest fire rate and movement speed |
| **MEDIC** | Durable support | 110 | Slowly heals over time; HP packs restore twice as much |

Open **Intel Database** from the main menu to browse full stats and select your operative.

---

## Difficulty Modes

Set on the main menu before you deploy.

- **STANDARD** — Normal enemies. Recommended starting point.
- **VETERAN** — Enemies have 40% more HP and move 20% faster. Noticeably harder.
- **GHOST** — One hit kills you instantly. No second chances.

---

## Enemies

Every wave, enemies get a little faster and tougher. This scaling stacks across waves, so wave 10 enemies are significantly more dangerous than wave 1.

| Enemy | What it does |
|-------|-------------|
| **RUNNER** | Charges straight at you. Fast, not very tough. |
| **SCOUT** | Fastest unit in the game. Glass cannon — kill it quickly. |
| **TANK** | Huge HP, slow movement. Takes sustained fire to bring down. |
| **SNIPER** | Keeps its distance and fires precise shots. Keep moving. |
| **BOMBER** | Walks slowly toward you and explodes on contact for 60 damage. Kill it at range before it gets close. Appears from wave 3. |
| **OVERLORD** | Boss unit that appears every 5 waves. See below. |

---

## Boss Waves (Every 5 Waves)

Waves 5, 10, 15, and so on replace normal enemies with a single giant OVERLORD boss. A health bar appears at the top of the screen during the fight.

The OVERLORD has three phases that get more aggressive as its HP drops:

1. **Phase I** — Slow approach, fires single shots
2. **Phase II** — Faster movement, fires a 3-bullet spread each time
3. **Phase III** — Full sprint directly at you (berserk charge)

Killing the boss drops 3 guaranteed pickups and awards a large score bonus.

---

## Wave Modifiers

From wave 2 onward, each wave has a chance to get a random modifier. A banner flashes on screen when one is active.

| Modifier | What changes |
|----------|-------------|
| **BLITZ** | Every enemy is a Scout. Fast and chaotic. |
| **SIEGE** | Snipers only. Punishes standing still. |
| **ARMORED** | All enemies have double HP. Conserve your ammo. |
| **SWARM** | Twice as many enemies, each with less HP. Sheer volume is the threat. |

---

## Kill Combos

Kill enemies quickly back to back and your score multiplier increases.

| Kills in a row | Multiplier |
|---------------|-----------|
| 2 | ×2 |
| 4 | ×3 |
| 7 | ×4 |

The multiplier resets about 2 seconds after your last kill. The current multiplier is shown in the HUD next to your score. High combos also count toward the COMBO MASTER achievement.

---

## Pickups and Drops

Walk over drops to collect them. Enemies drop them on death. The system checks your current HP and ammo before deciding what to spawn.

| Drop | Color | What it does |
|------|-------|-------------|
| **HP Pack** | Red | Restores 25 HP. Medic gets 50 HP. |
| **Ammo Crate** | Cyan | Refills your full reserve ammo. Guaranteed if you run critically low. |
| **Speed+** | Magenta | Move 80% faster for 6 seconds. |
| **Shield** | Blue | Blocks all incoming damage for 4 seconds. Rarest standard drop. |
| **Rapid+** | Orange | Much faster fire rate for 6 seconds. |
| **Overclock** | White | Doubles your bullet damage for 5 seconds. Rare. Great against bosses. |
| **Rocket** | Yellow | Gives you a 3-shot rocket launcher. Press F to fire. Explodes on impact and damages everything nearby. Very rare. |

---

## Achievements

Unlocked through play. Saved permanently. A toast notification appears at the bottom of the screen when you earn one.

| Achievement | How to unlock |
|-------------|--------------|
| **FIRST BLOOD** | Kill your first enemy |
| **FLAWLESS** | Finish a wave without taking any damage |
| **SPEED DEMON** | Collect 3 Speed+ boosts in a single run |
| **CENTURION** | Kill 100 enemies in a single run |
| **EXECUTIONER** | Kill 500 enemies total across all your runs |
| **BOSS SLAYER** | Defeat your first OVERLORD boss |
| **COMBO MASTER** | Reach a ×4 kill combo |

---

## Rank and XP

You earn XP at the end of every run based on your score, kills, and waves survived. XP is saved between sessions and carries over across all runs.

| Rank | XP needed |
|------|----------|
| ROOKIE | 0 |
| OPERATIVE | 500 |
| SPECIALIST | 1,500 |
| VETERAN | 3,500 |
| GHOST | 7,500 |
| LEGEND | 15,000 |

Your rank and progress bar are shown on the main menu. Reaching a new rank plays a special sound and shows a badge on the end-of-run screen.

---

## End of Run Stats

When you die, instead of a plain score screen you get a full breakdown:

- **Score** and **Best Score**
- **Waves survived**
- **Total kills**
- **Accuracy** (shots fired vs hits landed)
- **Survival time**
- **XP earned** and your current rank with a progress bar
- A **RANK UP** badge if you levelled up this run

---

## Visual Features

These are active during every game session with no setup needed.

- **Kill feed** — Right side of the screen shows your recent kills with enemy name and score. Fades out after a few seconds.
- **Hit flash** — Enemies briefly flash bright white when a bullet connects. Clear feedback every shot.
- **View bob** — The camera gently bobs while you walk, making movement feel physical.
- **Dynamic city lights** — Every building light in the city pulses and flickers on its own cycle.
- **Chromatic aberration** — When you take damage the screen briefly distorts with colour fringing before snapping back.

---

## Intel Database

Open from the main menu. Browse full stats, descriptions, and 3D previews of every operative, enemy type, and drop in the game. Select your operative here before deploying.

---

## File Structure

```
├── index.html        — All markup: menu, HUD, boss bar, kill feed, touch controls
├── css/
│   └── style.css     — All styling and animations
└── js/
    ├── state.js      — Shared state, constants, audio, rank/achievement data
    ├── controls.js   — Keyboard (incl. F key), mouse, pointer-lock, touch input
    ├── mobile.js     — Fullscreen, orientation lock, gyroscope
    ├── tutorial.js   — Tutorial slides and practice run
    └── game.js       — World, game loop, enemies, bullets, drops, waves, HUD, all features
```

---

## Running Locally

No build step required.

```bash
python3 -m http.server 5000
```

Then open `http://localhost:5000` in any modern browser.

---

## Tech

- **Three.js r128** — 3D scene, geometry, lighting
- **Web Audio API** — all sounds generated procedurally, no audio files
- **Pointer Lock API** — mouse-look
- **localStorage** — high score, XP, achievements, settings all persist between sessions
- Pure HTML5 / CSS3 / ES6+ — zero dependencies beyond Three.js

---

## License

MIT — do whatever you like with it.
