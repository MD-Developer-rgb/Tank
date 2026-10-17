# THE LAST FIVE NIGHTS

First-person survival horror in a remote forest compound. Find the parts, restore power, and escape - while **the Hollow** hunts you by sound, sight and the clues you leave behind. Built with plain HTML/CSS/JavaScript and the PlayCanvas engine, using only primitive shapes (no model or texture files).

## 1. How to run
The game needs a static web server (browsers block some features from `file://`).

- **Desktop:** open a terminal in this folder and run `python -m http.server 8000`, then open <http://localhost:8000>.
- **Android (Termux):** `pkg install python`, `cd` into the folder, `python -m http.server 8000`, open `http://localhost:8000` in Chrome.
- **Any static host:** upload the whole folder (GitHub Pages, Netlify, itch.io HTML5, ...).

The engine is loaded from the CDN; see section 4 for offline use. Click/tap **TAP TO START** (needed for audio).

## 2. Controls
| Action | Keyboard / mouse | Mobile |
|---|---|---|
| Move | W A S D | Left joystick |
| Look | Mouse | Drag the right side of the screen |
| Run (loud, uses stamina) | Shift | RUN (toggle) |
| Crouch / hide in bushes | C | HIDE (toggle) |
| Interact (hold for long actions) | E | E button |
| Flashlight | F | LIGHT |
| Use spare battery | B | inventory button |
| Map | M | MAP |
| Inventory / notebook | Tab or I | BAG |
| Objective | O | - |
| Pause | Esc or P | II |
| Fullscreen | U (or the corner button / Settings) | auto on first tap |

Tips: noise attracts the Hollow (running, doors, generator, radio). Rain muffles sound. Water breaks its trail. Hide by crouching still in a bush. Bright lights lure it - and expose you.

## 3. Audio
All sound **effects are generated in code** (`js/synth.js`) - the game has full SFX with an empty `audio/` folder. Effects run through a master compressor with a shared room reverb, repeated sounds (footsteps, doors, pickups) use several variants plus slight pitch variation, and distant sounds are low-passed. Music is loaded from `audio/*.mp3` if present (`menu_music`, `chase_music`, optionally `ambient_forest_night`, `rain_loop`, `wind_loop`). See `audio/musicreadme.txt` for every file name. Missing files are silently skipped.

**Music is generated too:** if `audio/menu_music.mp3`, `audio/chase_music.mp3` or `audio/ending_music.mp3` are missing, the game plays built-in procedurally generated tracks instead (a dark ambient menu loop, a pulsing chase loop whose volume follows how close the Hollow is, and a short ending theme). Put your own mp3 with the same name in `audio/` and it replaces the built-in one.

## 3b. Scares, chases and cut-scenes
- **Chase rules:** the Hollow is slower than your sprint (you gain about 1.4 m/s), but you only have so much stamina, so break line of sight (trees, doors, buildings), cross the stream, hide in a bush or climb the tower. If you get more than ~26 m away for a couple of seconds, or a chase never gets close, it gives up and starts searching. A long chase also tires it slightly.
- **Jump scares:** every 1-2 minutes something can happen (it stands in the fog and lunges when you look at it, sprints across your path, whispers and appears behind you, or the lights die). Being caught is a full jump scare. None of the decoy scares can hurt you. Tune it in `js/scares.js`.
- **Cut-scenes:** both escapes are camera sequences: the truck drive-out with the creature running behind (route A) and the helicopter rescue at the beacon (route B).

## 4. Offline PlayCanvas
Save `playcanvas.min.js` into `lib/` (see `lib/README.txt`). The game falls back to it automatically if the CDN fails.

## 5. Changing difficulty and balance
Everything tunable is in `js/config.js`: `DIFF` (hearing, sight range, chase speed, flashlight seconds, attempts, detector range, beacon time), `HOLLOW` (speeds, vision cone, search times, aggression), `NOISE` (loudness of each action), `PLAYER`, `WEATHER`, `QUALITY` and `LOOK` (raise `LOOK.ambient` if it is too dark on your screen).

## 6. Known limitations / ideas
- Built from primitives only, so models are simple by design.
- One enemy type and one map; ideas: more areas, a second enemy that reacts to light, day/night cycle, more endings, procedural item placement.
- Settings are saved in `localStorage` (`tlfn_settings`); progress in `tlfn_save` (checkpoint based).
- There is a secret ending - explore the far north of the map.

## 7. Credits
Created by MD Developer.
