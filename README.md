# Cinder Foundry

A round-based tactical first-person shooter that runs entirely in the
browser on three.js. Two foundry crews fight over a working smelting
hall: the **Wardens** push north across the casting floor to plant a slag
charge at the main furnace, while the **Ash Reavers** hold the lanes,
the bridges and the furnace itself.

The hall is split by two glowing molten runnels. The melt burns anyone
who wades through it, so all movement funnels onto three gantry bridges
— and every bridge is a sightline somebody is watching.

## How a match runs

- First crew to 7 rounds takes the match (12 rounds maximum).
- A round is won by eliminating the other crew, or by the charge:
  detonation wins it for the Wardens, a defuse or the clock wins it for
  the Reavers.
- Between rounds there is a short buy phase. Kills, plants and round
  results pay out; cash and your bought gun carry over between rounds.
- Accuracy beats spray: spread blooms while you move, jump or hold the
  trigger, and tightens right up when you stop or crouch behind cover.
  Headshots hit several times harder than body shots.

## The armoury

| Key | Weapon | Price | Character |
| --- | --- | --- | --- |
| — | Piston Sidearm | free | starter pistol, honest and slow |
| 2 | Slag Scattergun | $900 | eight pellets, brutal up close |
| 3 | Rivet Carbine | $1700 | cheap automatic all-rounder |
| 4 | Forge Lance | $2700 | harder-hitting automatic, longer reach |
| 5 | Crucible Longshot | $4200 | one-shot bolt gun with a scoped zoom (right mouse) |
| 6 | Cinder Grenade | $300 | thrown blast charge, key G in round |

The bots patrol real routes through the hall, check lines of sight,
react to gunfire they hear, strafe and crouch in a fight, burn in the
melt like everyone else, and — once the charge is planted — the Reavers
converge on it and try to quench it.

## Controls

- **WASD** move, **mouse** look (pointer lock), **click** fire
- **R** reload, **Ctrl** or **C** crouch, **Space** hop
- **E** hold at the furnace ring to plant the charge
- **G** throw a cinder grenade, **right mouse** aim with the Longshot
- **1–6** buy during the buy phase, **Enter** start the round early
- **Tab** scoreboard

## Running it

The game is static files with no build step. Serve the `game/` folder
with any static file server and open `index.html` in a desktop browser:

```
python3 -m http.server 8080 --directory game
# then visit http://localhost:8080
```

All sound is synthesised live with the Web Audio API — gunfire,
explosions, plant beeps and round stingers — so the game ships no audio
files and makes no network requests.

## Layout

- `main.ts` — the handover program: copies `game/` and `screenshots/`
  to the output directory and writes `dossier.json`.
- `game/index.html` — page, HUD and the single import map for three.js.
- `game/src/world.js` — the foundry: geometry, colliders, hazards, routes.
- `game/src/bots.js` — bot crews: patrol routes, perception, burst fire.
- `game/src/player.js` — movement, crouch, collision for the local player.
- `game/src/weapons.js` — the armoury: prices, damage, spread model.
- `game/src/audio.js` — the Web Audio synth bank.
- `game/src/hud.js` — every DOM readout, the buy panel and the scoreboard.
- `game/src/rng.js` — seeded random source for reproducible scenes.
- `game/src/main.js` — round flow, economy, combat resolution, effects.
