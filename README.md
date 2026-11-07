# Beastfall

A 3D animal battle game with over 100 creatures: dinosaurs, insects, big cats, sharks, even a unicorn.
Raise a herd, deploy it, and watch it fight. Every battle your beasts fight earns XP and gold, and they
level up and visibly evolve as they grow.

Everything is generated in code: creature models, textures, environments, effects, music and sound.
There are no asset files to download or license.

## Run it

```bash
npm install
npm run dev      # then open the URL it prints
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Play locally with hot reload |
| `npm run build` | Type-check and build a static site into `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Run the rules tests, including a full campaign playthrough by a bot |
| `npm run build:single` | Build the whole game into one self-contained file, `dist-single/beastfall.html` |

To try it on a phone on the same Wi-Fi, run `npm run dev -- --host` and open the Network address it prints.

## How to play

1. **Camp:** pick a stage, recruit beasts in the Market, buy permanent Upgrades.
2. **Deploy:** drag beasts onto the blue zone, up to your Command limit. Right-click to remove one.
3. **Fight:** the herd fights on its own. You can step in at any point.
4. **Results:** collect gold, watch XP bars fill, and see level-ups play out on the battlefield.

Beasts evolve at level 5 (Veteran), 10 (Elite, with spines and glowing veins) and 20 (Legend, with a
crown and aura), up to level 30.

Want dinosaurs right away? Sandbox mode has every creature unlocked at any level, with filters for
Dinosaurs, Bugs, Predators, Herd, Reptiles, Birds, Sea and Mythic. Sandbox battles pay no XP or gold.

### On a phone

Tap a beast to deploy it, or drag it up onto the field. Tap a beast on the field to remove it. Drag to
rotate the camera and pinch to zoom. Tap a beast in battle, then Control, for a joystick and Attack and
Ability buttons. It works upright, but it's best held sideways.

### Battle controls

| Input | Action |
| --- | --- |
| Drag / scroll | Rotate / zoom camera |
| WASD or arrows | Pan the camera |
| Click a beast | Select it |
| `F` | Follow the selected beast |
| `G` | Take direct control of the selected beast |
| `WASD`, Space or click, `E` | While controlling: move, attack, use ability |
| `1` `2` `3` | Spirit powers: Rally Bloom, Meteor, Sky Rend |
| Space | Pause |
| `+` / `-` | Change battle speed |
| `Tab` | Cycle through your beasts |
| `Esc` | Cancel, release, or open the pause menu |

## Code layout

```
src/sim/    Game rules with no rendering: species, battle simulation, XP and gold, campaign
src/gfx/    3D: creature builder and animation, biomes, particles, effects, camera, post-processing
src/ui/     Styles, DOM helpers, portrait renderer
src/game.ts Screens and flow: title, camp, deploy, battle, results
src/audio.ts Synthesised sound effects and music
tests/      Rules tests and the campaign bot
```

To add an animal, add one line to `src/sim/species.ts` (stats come from a formula) and one to
`src/gfx/looks2.ts` (appearance comes from a body-plan preset). The tests check that it builds.

The simulation only emits events, and the visuals only read them. So you can change balance in
`src/sim/species.ts` and `src/sim/stages.ts` and re-run `npm test` to confirm the campaign can still
be finished.

`/gallery.html` (dev server only) shows every creature side by side, for example
`/gallery.html?evo=3&only=lion,tiger&sp=4`.
