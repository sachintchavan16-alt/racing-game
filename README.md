# Jungle Rider

A lightweight 3D bike racing game for Android, built with **Three.js + Vite + Capacitor**.
Race three AI rivals over a 2.1 km course through jungle trail, mud flats, a river
crossing, a mountain climb, a summit ridge and a jungle descent — with tigers, deer
and bears roaming outside the track.

Five sportbikes, a live P1–P4 standings board, image-based lighting, high-resolution
procedural surface maps and a mobile-tuned post-processing chain — all generated in code.
There are no 3D model files, no image files
and no audio files in this repository. Road, terrain, jungle, water, animals, bikes,
rivals and even the app icon are all produced procedurally at build/run time, which is
why the whole game ships in a fraction of the 15 MB budget.

---

## Contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Requirements](#requirements)
- [Quick start (desktop browser)](#quick-start-desktop-browser)
- [Testing on a real phone](#testing-on-a-real-phone)
- [Building for Android](#building-for-android)
- [Controls](#controls)
- [Project structure](#project-structure)
- [File size and asset strategy](#file-size-and-asset-strategy)
- [npm scripts](#npm-scripts)
- [Tuning the game](#tuning-the-game)
- [Troubleshooting](#troubleshooting)

---

## Features

**Track and environment**

- Spline-driven course with six distinct zones that blend into each other:
  `Jungle Trail → Mud Flats → River Valley → Mountain Climb → Summit Ridge → Jungle Descent`
- Banked road ribbon with shoulders, built per-zone so each surface has its own
  material (dirt, mud, wet gravel, mountain rock).
- Terrain generated as ribbons that follow the track, with per-zone side profiles:
  rolling jungle hills, flat mud plains, a carved river valley, a cliff on one side
  of the mountain climb, and a narrow ridge at the summit. Snow appears above 46 m.
- A 70 m climb, then a long descent back into the jungle.
- Six designed dirt-jump ramps that launch you airborne if you carry enough speed.
- A flowing river with an animated water shader, a 130 m bridge with railings and
  pillars, and a shallow ford you ride through on the descent.
- Mud patches and wet gravel that reduce grip and drag you down.
- Distant rim hills plus exponential fog hide the world edge and give each zone its
  own atmosphere (each zone has its own fog colour, sky gradient and sun tint).

**Wildlife**

- 9 tigers, 12 deer and 7 bears, placed only in the zones that suit them.
- Instanced rendering (two draw calls per species) with animated leg swing, body bob
  and heading that follows their real movement.
- Behaviour states: wander, alert (stops and faces you), and flee (runs away from the
  rider). They are hard-constrained to stay outside the track — enforced at 3.5 m
  beyond the road edge.
- The HUD announces when a spooked animal is close.

**Bike and handling**

- Five low-poly sportbikes, all procedural and vertex-coloured: a **Honda CBR**
  Fireblade (red/white/blue), a **Yamaha R15 V4** (racing blue with twin LED slits),
  a **Kawasaki ZX-10R** (lime green with winglets), a **KTM RC** (orange with a
  trellis frame and split seat) and a bonus apex-matt-black livery. Each has its own
  nose profile, tail lift, screen rake, exhaust layout and rider leathers, so you can
  tell them apart at a glance.
- Spinning wheels, steering forks, lean-into-corner, suspension bob and a sportbike
  tucked-rider posture.
- Arcade physics with grip, drag and slope modelled per surface: engine curve that
  falls off with speed, braking, gravity along the gradient, centrifugal force pushing
  you wide in corners, reduced grip and extra drag in mud, water and off-road.
- Airborne jumps with a real flight arc and a speed penalty on landing.

**Rivals and race position**

- You race **three AI rivals** (add a fourth by appending one entry to `RACE_FIELD`),
  each a different brand on its own start-grid slot.
- The AI works in the same track space and reads the same grip/curvature numbers as
  the handling model, so it is subject to identical mud, water, slope and jump rules:
  - picks a racing line, cutting the inside of the corner by looking up to 62 m ahead;
  - brakes for corners using a speed limit *derived from the handling model* rather
    than a magic number, so it slows exactly where a rider would have to;
  - holds momentum on climbs instead of lifting, and commits to jump ramps;
  - avoids rivals (lane bias + lift when boxed in) and steers around on-track hazards;
  - recovers if it gets wedged.
- Soft body-to-body contact: nobody is teleported, riders are eased apart laterally
  and the rider behind concedes a little speed. No passing through each other.
- Live standings on the HUD — **P1/P2/P3/P4** with a livery swatch and the gap to the
  leader — plus a big position badge and gap for your own ride.
- A full finishing classification in the results panel, with projected times for any
  rival still out on course when you cross the line.
- Nine fallen rocks and logs sit on the racing surface as hazards. Placement is
  deterministic and rule-based: never within 30 m of a jump ramp or 22 m of a
  checkpoint gate, and always inside the road. The AI steers around them; hit one and
  you get shoved sideways with a slower exit.

**Rendering and lighting**

- **Image-based lighting.** A pre-filtered environment map is captured from the very
  same procedural sky the player sees, sharing its uniforms, so metal and paint pick up
  the real horizon colour. It is rebuilt only when the biome changes — six times per
  race — because a PMREM pass is far too costly to run per frame. This is also what
  makes the metallic paint on the bikes read as paint rather than as flat colour.
- **Surface maps at up to 512²**, generated in code: albedo, tangent-space normal, and a
  packed roughness/ambient-occlusion map. The noise is lattice-wrapped so it tiles
  seamlessly across a two-kilometre road instead of showing a repeating seam.
- **Dynamic sun shadows** with a tight orthographic frustum (42–66 m, scaled by tier)
  that follows the rider, PCF soft filtering, and normal-bias tuned for the terrain scale.
- **Exponential fog and a gradient sky dome** that re-tint per biome, with the fog
  colour, horizon, sun tint and water reflection all driven from the same zone table.
- **Water shader** with two cross-flowing ripple layers, Fresnel-weighted reflection,
  sun glitter, trough-darkening for depth and crest foam — plus a custom vertex
  displacement so the surface actually moves.
- **No particle effects.** There is no exhaust smoke, tyre dust or spray emitter in the
  scene — the only transparent surfaces are the water and the sky dome.
- **Post-processing**: HDR scene target, bright-pass bloom (one or two octaves),
  depth-based ambient occlusion, speed-scaled radial motion blur, vignette, film grain,
  and ACES tone mapping with the sRGB transfer — all in one composite pass.

**Performance**

- Three quality tiers scale render resolution, shadow map size and reach, the
  resolution of the generated surface maps, image-based lighting and the entire post
  chain. The frame-rate governor steps down and back up automatically.
- The post chain degrades to a direct render if the device cannot supply the render
  targets it needs, and the environment map is simply skipped on failure — neither can
  take the game down.
- Measured headless: the full world plus a four-bike race builds in ~1.4 s and the whole
  upgrade cost about **8 KB gzipped** over the previous build.

**Soundtrack**

- A **procedurally synthesised** 124 BPM electronic track — kick, snare, hats, a saw
  bass and a delayed arpeggio over an Am–F–C–G progression. There is no audio file: it
  is oscillators and a generated noise buffer through the Web Audio API, so it adds
  about **2 KB gzipped** to the bundle and nothing to the APK.
- A look-ahead scheduler queues notes against the audio clock, because a plain timer is
  far too jittery for music. Notes are scheduled ~120 ms ahead from a 25 ms timer.
- The mix **opens up with speed**: a low-pass on the music bus sweeps from 5 kHz at rest
  to 16 kHz at full throttle, so the track brightens as you accelerate.
- Starts on the START RIDE tap (browser autoplay policy requires a gesture), pauses and
  resumes with the game, and a **♪ MUSIC** chip mutes it — the choice is remembered in
  `localStorage`.
- Graceful by construction: if a device has no Web Audio the game boots and plays
  silently instead of failing.

**Mobile**

- Touch controls: an analogue steering stick on the left, hold-to-accelerate GAS and
  hold-to-brake pedals on the right. Multi-touch with pointer capture.
- Optional tilt steering using the device gyroscope (with the iOS permission prompt).
- Gamepad and keyboard support for desk testing.
- Landscape lock + fullscreen on start, safe-area-aware layout for notched screens.
- Adaptive quality: monitors frame rate and steps the pixel ratio / shadows down or
  back up automatically.
- DOM-based HUD (crisp text, no canvas cost) with speed, timer, zone, surface
  warning, progress bar with checkpoint markers and split times.
- Race mode with a 3-2-1 countdown, three checkpoints, results screen, personal best
  in `localStorage`, and a free-ride mode after finishing.
- No network requests at runtime, no external fonts, no analytics.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Renderer | **Three.js** (r169) | Real 3D for mountain/river immersion; ~150 KB gzipped. |
| Bundler | **Vite 5** | esbuild minification, one chunk, no runtime bloat. |
| Android shell | **Capacitor 6** | Modern Cordova replacement; no Cordova plugins pulled in. |
| Assets | **Procedural** | Zero binary art ⇒ tiny download, instant iteration. |

---

## Requirements

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 18 or newer (tested on 24) | Build and dev server |
| JDK | **17** | Android Gradle build (Capacitor 6) |
| Android Studio | Latest (or just the SDK + platform tools) | SDK, emulator, `adb` |
| Android SDK | API 34 platform + build tools | Compiling the APK |

Set `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) to your SDK path, and make sure
`%ANDROID_HOME%\platform-tools` is on `PATH` so `adb` works.

```powershell
# Windows (adjust to your SDK location)
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx PATH "$env:PATH;$env:LOCALAPPDATA\Android\Sdk\platform-tools"
```

> Java 17 specifically: Capacitor 6 targets Java 17. A newer JDK (21/23) will usually
> work, but 17 is the version the Android Gradle Plugin is validated against.

---

## Quick start (desktop browser)

```bash
npm install
npm run dev
```

Open the printed URL (usually <http://localhost:5173>). Press **START RIDE** to enter
fullscreen and begin.

Useful dev URL: append `?debug` to show a live FPS / draw-call / triangle overlay.

```bash
npm run dev -- --open "/?debug"
```

Before shipping, run the full local verification (headless tests + build + size report):

```bash
npm run verify
```

---

## Testing on a real phone

The fastest loop is Vite's dev server over your LAN — no Android build needed:

1. Put the phone on the same Wi-Fi as your PC.
2. `npm run dev` (it already binds to `0.0.0.0`).
3. Find your PC's LAN IP with `ipconfig` (e.g. `192.168.1.20`).
4. Open `http://192.168.1.20:5173` in **Chrome on the phone**.

Hot reload works, so you can tune handling and immediately feel the difference.

To debug on-device, enable USB debugging, connect the phone, then open
`chrome://inspect/#devices` on your desktop and click **inspect** on the app's
WebView. `webContentsDebuggingEnabled` is already `true` in `capacitor.config.json`
(remember to turn it off for a release build).

---

## Building for Android

### 1. One-time: add the Android platform

```bash
npm install
npx cap add android     # creates the android/ folder (git-ignored)
```

Optionally give the app a real launcher icon and splash screen:

```bash
npm run assets          # generates assets/icon.png + assets/splash.png procedurally
npx @capacitor/assets generate --android --iconBackgroundColor '#0d2a14'
```

Skipping this step is fine — Capacitor ships a default icon.

### 2. Sync the web build into the native project

```bash
npm run cap:sync        # runs vite build, then cap sync android
```

This copies `dist/` into `android/app/src/main/assets/public/`. **You must re-run
this after every web change**, otherwise the APK still contains the old bundle.

### 3. Build and install

**Option A — Android Studio (recommended first time)**

```bash
npm run cap:open        # opens android/ in Android Studio
```

Then press **Run ▶**. Pick your device or an emulator.

**Option B — Command line (debug APK)**

```bash
npm run android:debug   # web build + sync + gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

Install it on a connected device:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or run it straight from the project:

```bash
cd android
gradlew.bat installDebug
adb shell am start -n com.junglerider.game/.MainActivity
```

**Option C — Release APK**

Create a signing key once, then build a signed release:

```bash
keytool -genkey -v -keystore jungle-rider.keystore -alias jungle-rider ^
        -keyalg RSA -keysize 2048 -validity 10000
```

Copy `android/app/build.gradle` into a `signingConfigs` block pointing at that
keystore, then:

```bash
npm run android:release
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. Keep the keystore
and its password safe — you need the same key for every future update.

For a Play Store upload you want an **AAB** instead:

```bash
cd android
gradlew.bat bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Emulator note

The Android emulator gives you a software GL renderer, so frame rate will be much
lower than on a real device. Trust performance measurements on physical hardware.
The built-in adaptive quality will drop to the LOW preset and disable shadows if it
cannot hold ~38 FPS.

---

## Controls

**Touch (primary)**

| Control | Action |
| --- | --- |
| Left stick | Steering (analogue, self-centring) |
| **GAS** (right, large) | Hold to accelerate |
| **BRAKE** (right, small) | Hold to slow / stop |
| **TILT STEER** chip | Toggle gyroscope steering (then hold the phone flat to calibrate) |
| **II PAUSE** chip | Pause / resume (also pauses the music) |
| **♪ MUSIC** chip | Mute / unmute the soundtrack (remembered across sessions) |

**Keyboard**

| Key | Action |
| --- | --- |
| `W` / `↑` / `Space` | Accelerate |
| `S` / `↓` | Brake |
| `A` / `←`, `D` / `→` | Steer |

**Gamepad** — left stick steers, `RT` (button 7) accelerates, `LT` (button 6) brakes.

**Tips**

- Mud and off-road drop your grip: smooth, small steering inputs work better than
  full lock.
- A `JUMP AHEAD` toast warns you about ramps. Hit them at speed to clear them.
- Uphill sections cost a lot of speed — momentum matters.
- Corners cannot be taken flat out. The bike is pushed wide by centrifugal force, so
  brake before the apex and steer into the turn, exactly like the AI does.
- Rocks and logs sit on the racing surface. Hitting one shoves you sideways, so pick
  a line early — the same way the rivals do.
- Watch the standings board on the right: it shows each rider's livery colour, their
  live position and the gap to the leader.

---

## Project structure

```
andriod game/
├── index.html                  # shell: canvas + UI mount + boot splash
├── vite.config.js              # relative base (required by Capacitor), single chunk
├── capacitor.config.json       # app id, app name, webDir
├── package.json
│
├── src/
│   ├── main.js                 # boot: builds the game, wires the START button
│   ├── styles.css              # HUD, touch controls, safe-area layout
│   │
│   ├── core/
│   │   ├── Game.js             # orchestrator: build order, main loop, race state,
│   │   │                       # chase camera, adaptive quality, post FX wiring
│   │   ├── MathUtils.js        # clamp/lerp/damp, seeded RNG, value noise + fBm
│   │   └── Input.js            # keyboard + touch + gyroscope + gamepad unification
│   │
│   ├── assets/
│   │   └── textures.js         # cached tileable height fields -> albedo, normal and
│   │                           # packed ORM maps, generated on a canvas. No image files.
│   │
│   ├── audio/
│   │   └── Music.js            # procedural soundtrack (Web Audio, no audio files)
│   │
│   ├── render/
│   │   ├── Environment.js      # PMREM environment map captured from the live sky (IBL)
│   │   └── PostFX.js           # bloom + depth SSAO + motion blur + vignette + ACES out
│   │
│   ├── world/
│   │   ├── Track.js            # control points, zone table, jump ramps, road mesh,
│   │   │                       # sample frames, surface grip/drag model
│   │   ├── Terrain.js          # biome-profiled heightfield that follows the track
│   │   ├── Water.js            # river surface, bridge, ford (custom GLSL shader)
│   │   ├── Scenery.js          # instanced trees/rocks/bushes/logs/grass + race gates
│   │   ├── Obstacles.js        # on-track hazards: rule-based placement + hit queries
│   │   ├── Animals.js          # tiger / deer / bear geometry, instancing, AI
│   │   ├── Sky.js              # gradient sky dome, sun, fog, hemisphere light
│   │   └── GeoHelpers.js       # vertex-coloured geometry merging, jitter, grid builder
│   │
│   ├── bike/
│   │   ├── BikeStyles.js       # the five sportbike liveries + procedural geometry
│   │   ├── Bike.js             # bike mesh hierarchy + wheel/steer/lean animation
│   │   ├── AIDriver.js         # autonomous rider: line, cornering, avoidance
│   │   ├── Contacts.js         # rider-vs-rider contact and hazard collisions
│   │   └── Physics.js          # arcade handling model (grip, slopes, air, slip)
│   │
│   └── ui/
│       ├── HUD.js              # speed, position, standings, splits, results board
│       └── TouchControls.js    # virtual stick + pedals (pointer events, multi-touch)
│
├── scripts/
│   ├── smoke-test.mjs          # headless test: builds the whole world, simulates a race
│   ├── size-check.mjs          # bundle size report + APK estimate vs the 15 MB budget
│   └── make-assets.mjs         # procedurally writes assets/icon.png + splash.png
│
├── assets/                     # generated icon/splash (git-ignored, regenerable)
└── android/                    # created by `npx cap add android` (git-ignored)
```

---

## Rendering pipeline

```
scene ──► HDR render target (+ depth)            linear, tone mapping OFF
            │
            ├─► bright pass ─► blur H/V  (1/2 res)  ─┐
            │                 └► blur H/V (1/4 res) ─┴─► combine
            │
            └─► composite ── scene + bloom + SSAO + motion blur + vignette + grain
                             + ACES tone mapping + sRGB transfer ──► canvas
```

Three things are worth knowing about this design.

**Tone mapping has to be done by hand.** Three skips tone mapping and the output
transfer function when rendering into a render target — that is precisely why
`EffectComposer` needs an `OutputPass` at the end. The composite shader therefore
reproduces three's own `ACESFilmicToneMapping` (including its two colour matrices) and
`sRGBTransferOETF` exactly, and `renderer.toneMapping` is set to `NoToneMapping` while
post is active. Turning post-processing off is therefore a pixel-identical image, not a
different look.

**The post chain is hand-rolled rather than `EffectComposer` + `UnrealBloomPass`.** The
stock bloom alone costs five downsamples and ten blur passes per frame, which is a poor
fit for a phone GPU. This chain is five to seven passes total, sized by the quality tier,
and folds AO, motion blur, vignette, grain and output conversion into a single composite.

**Ambient occlusion is a compact depth-based SSAO.** It reconstructs view-space position
from the depth buffer, derives the normal from two extra depth taps (rather than
`dFdx`, which would drag in an extension dependency), and samples a golden-angle spiral.
It is deliberately subtle and off entirely on the LOW tier.

### Honest notes on two techniques

- **Water reflection is analytic, not a screen-space planar reflection.** The water
  reflects the sky gradient and sun disc computed from the reflected view vector,
  modulated by Fresnel and the ripple normal. A true planar reflection means rendering
  the whole scene a second time each frame — the wrong trade on a phone — and getting the
  mirrored projection matrix and winding exactly right is not something that can be
  verified without a GPU. The analytic version reacts to the biome (it shares the sky
  uniforms), costs nothing, and cannot be subtly wrong.
- **Textures are not GPU-compressed (KTX2/Basis), deliberately.** There are no image
  files in this project — every map is synthesised in a `<canvas>` at load — so there is
  nothing to pre-compress. Adding a Basis transcoder would put ~250 KB of WASM into the
  APK to compress data that is *already* smaller than the transcoder. What is used
  instead is the real compression that applies here: **channel packing** (one ORM texture
  serving roughness, ambient occlusion and metalness through its R/G/B channels, halving
  the texture count) and **resolution scaling** (surface maps generate at 256² on the LOW
  tier and 512² above, cutting VRAM fourfold). If you later import real photo textures,
  KTX2 + `KTX2Loader` is the right call at that point.

### Quality tiers

| | LOW | MEDIUM | HIGH |
| --- | --- | --- | --- |
| Pixel ratio cap | 1.0 | 1.3 | 2.0 |
| Shadows | off | 1024², 55 m | 2048², 66 m |
| Surface maps | 256² | 512² | 512² |
| Environment (IBL) | off | on | on |
| Bloom | off | 1 octave | 2 octaves |
| Ambient occlusion | off | 5 samples | 9 samples |
| Motion blur samples | 4 | 4 | 6 |

Mobile starts at MEDIUM, desktop at HIGH. The governor measures FPS and steps down below
38 FPS, back up above 57 FPS.

---

## File size and asset strategy

`npm run size` reports the real numbers. Current build:

| Artifact | Raw | Gzipped |
| --- | --- | --- |
| `assets/app.[hash].js` (Three.js + all game code) | ~0.59 MB | ~0.16 MB |
| `assets/style.[hash].css` | ~11 KB | ~3 KB |
| `index.html` | ~1.5 KB | ~0.7 KB |
| **Total web payload** | **~0.60 MB** | **~0.16 MB** |

Estimated release APK: **~3.8 MB** (web payload + ~3.6 MB Capacitor/AndroidX runtime),
against a 15 MB budget. Roughly **11 MB of headroom**.

The entire graphics upgrade — image-based lighting, post-processing, the water shader,
512² normal and roughness maps — cost about **8 KB gzipped**, because it is all code
generating data at runtime rather than data shipped in the bundle.

How it stays small:

1. **No binary assets at all.** Every texture is drawn to an offscreen `<canvas>` at
   startup; every mesh — including all five bikes — is built from Three.js primitives
   and merged into vertex-coloured geometries; the soundtrack is synthesised from
   oscillators. Nothing but code is downloaded.
2. **Merged geometry.** A whole tree (trunk + 4 canopy blobs), a whole animal, or a
   whole sportbike (fairings + tank + tail + exhaust, or rider + limbs) is one
   `BufferGeometry` with baked per-vertex colour, so props need no textures and no
   material switches. A bike is 5 draw calls.
3. **One field, three maps.** Nine surface types share four cached, seamlessly tiling
   height fields; each field feeds an albedo, a normal map and a packed ORM map. No
   noise is evaluated twice.
4. **Channel packing.** Roughness, ambient occlusion and metalness ride in the R/G/B of a
   single map, so a surface needs three textures instead of five.
5. **Geometry reuse.** Bike geometry is cached per livery and all four riders share one
   paint, one leather and one wheel material — livery comes purely from vertex colour.
6. **Instancing with spatial chunking.** ~11,700 scenery props render through ~51
   `InstancedMesh` chunks. Chunking by track distance means off-screen chunks are
   frustum-culled, so the real draw-call count per frame is far below 51.
7. **Single bundle.** `inlineDynamicImports: true` + `cssCodeSplit: false` keep the
   output at exactly three files, and `console.log` is stripped at build time.
8. **No physics engine.** The handling model is ~200 lines of hand-tuned maths rather
   than a RigidBody library, and the AI reasons in track space rather than raycasting.

If you need to shrink it further: switch the `three` import to a custom build that
omits unused loaders, or drop to the LOW tier permanently (which removes the shadow map
and the post chain's render targets entirely).

---

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on the LAN with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run smoke` | Headless test: builds the world, simulates a full race, checks the HUD |
| `npm run size` | Bundle size report + APK size estimate vs the 15 MB budget |
| `npm run verify` | `smoke` + `build` + `size` — run this before shipping |
| `npm run assets` | Regenerate `assets/icon.png` and `assets/splash.png` |
| `npm run cap:sync` | Build the web app and copy it into the Android project |
| `npm run cap:add` | Add the Android platform (first time only) |
| `npm run cap:open` | Open the Android project in Android Studio |
| `npm run android:debug` | Sync + `gradlew assembleDebug` |
| `npm run android:release` | Sync + `gradlew assembleRelease` |

`npm run smoke` is a genuine end-to-end check with no GPU required, and it runs in
about a second. Coverage:

- **World** — generates every surface map; builds the track, terrain, road, river,
  scenery, hazards and animals; verifies frames are finite and orthonormal, geometry
  has no NaNs, and hazard placement respects its keep-out rules.
- **Shading** — constructs the post-processing pipeline against a stub renderer and
  **verifies that every `uniform` declared in every shader is actually supplied by its
  material**, that no shader has unbalanced braces, that the composite applies ACES and
  the sRGB transfer, and that the quality tiers scale monotonically. This is the check
  that catches shader/material typos without a GPU.
- **Racing** — runs a solo full-throttle race as a physics regression check, then races
  the **full four-bike field** to the flag: every rider finishes, nobody is pushed off
  the road, no two riders pass through each other, the AI brakes and steers, the field
  finishes close together, and every livery is unique and distinct in silhouette.
- **Wildlife and UI** — animals never reach the track; the HUD standings, position badge,
  music toggle and results board all render; the joystick centres and the pedals latch
  and release.
- **Soundtrack** — the music module constructs without an `AudioContext`, fails soft when
  Web Audio is unavailable, and tears down cleanly.

Run it after any physics, track or shader change — it will tell you immediately if the
course became unfinishable, an animal started wandering onto the road, or a shader lost
a uniform.

---

## Tuning the game

**Course layout** — `src/world/Track.js`

- `CONTROL_POINTS` — the raw `[x, y, z]` spline the entire world is built around.
  Change these to redesign the course; everything else (road, terrain, scenery,
  animal placement, gates) follows automatically.
- `ZONES` — per-zone `halfWidth`, `grip`, `drag`, `mud`, `water`, `fog`, `skyTop`,
  `skyBottom`, `sun`, `density` (prop count), `profile` (terrain shape) and
  `animals` (which species live there). This is the main tuning table.
- `RAMPS` — jump kicker `at` (track fraction), `length` and `height`.

**Handling** — `src/bike/Physics.js`, the `BIKE` object at the top:
`MAX_SPEED`, `ENGINE`, `BRAKE`, `DRAG_K`, `ROLLING`, `STEER_AUTHORITY`,
`CENTRIFUGAL`, `AIR_GRAVITY`. Note that drag, not `MAX_SPEED`, is what caps real
straight-line speed (~124 km/h); `CENTRIFUGAL` is what makes corners matter and is
read by the AI too, so raising it slows the whole field into corners, not just you.

**Rivals and difficulty** — `src/core/Game.js`, the `RACE_FIELD` array. Each entry is
either the player or one AI rival:

| Field | Effect |
| --- | --- |
| `s`, `lateral` | Grid slot along and across the track |
| `styleId` | Which sportbike livery (`r15`, `ninja`, `duke`, `fireblade`, `phantom`) |
| `name` | Label shown in the standings |
| `skill` | Overall pace commitment, e.g. `0.96` = uses 96% of the physical limit |
| `cornerCaution` | Divides the corner speed limit — higher means more conservative |
| `avoidStrength` | How hard it swerves around rivals and hazards |
| `rampBravery` | Speed it commits to a jump ramp at |

Append a fifth entry (`styleId: 'phantom'`) to race four AI. The smoke test simulates
the whole field, so after any change run `npm run smoke` — it prints every finisher's
time and will fail if a rival starts crashing, cutting the course, or the field
spreads out too far.

**AI behaviour** — `src/bike/AIDriver.js`. `GRIP_MARGIN` is the fraction of available
lateral grip a rival dares to use mid-corner (lower = earlier braking);
`LATERAL_STIFFNESS` and `MAX_LAT_COMMAND` set how crisply it tracks its line;
`HORIZON_BASE`/`HORIZON_PER_SPEED` control how far ahead it looks. The physics-derived
corner limit means you rarely need to touch `CORNER_*`-style constants — if you retune
the handling model, the AI follows automatically.

**Hazards** — `src/world/Obstacles.js`. `TYPES` holds each hazard's shape and collision
half-extents; `RAMP_CLEARANCE` and `GATE_CLEARANCE` are the keep-out rules;
`OBSTACLE_SPACING` stops them bunching up. Set the density by changing the
`span / 150` divisor in `build()`.

**Wildlife** — `src/world/Animals.js`, the `SPECIES` array: `count`, `zones`,
`walkSpeed`, `fleeSpeed`, `fleeRadius`, `alertRadius`. Wildlife reacts to whichever
rider is nearest, so rivals spook animals too.

**Graphics budget** — `src/core/Game.js`, `QUALITY_LEVELS`: pixel ratio cap, shadow
toggle / map size / frustum reach, `surfaceSize` (the resolution the ground and road maps
are generated at), `envMap` (image-based lighting) and `post` (which tier of
`POST_QUALITY` from `src/render/PostFX.js`). `maxQualityIndex` sets the ceiling — mobile
starts at MEDIUM, desktop at HIGH.

**Post-processing feel** — `src/render/PostFX.js`, the `POST_QUALITY` table: `bloomStrength`,
`bloomThreshold`, `aoIntensity`, `aoRadius`, `aoSamples`, `motionStrength`, `vignette` and
`grain`. Setting a tier's `enabled` to `false` falls back to a direct render.

**Water look** — the two `createWaterMaterial` calls in `src/world/Water.js`: base shallow
and deep colours, `normalScale` (ripple strength) and `foamAmount` (crest foam). Sky and
sun reflection colours come from the zone table, so they follow the biome automatically.

**Texture resolution and detail** — `src/assets/textures.js`. `FIELD_RECIPES` controls the
octave count of each shared height field, the `*_PALETTES` tables control colour, normal
strength (`normal`) and the packed roughness/AO range (`orm`) per surface. `surfaceSize`
is passed in from the quality tier.

**Wildlife** — `src/world/Animals.js`, the `SPECIES` array: `count`, `zones`,
`walkSpeed`, `fleeSpeed`, `fleeRadius`, `alertRadius`. Wildlife reacts to whichever
rider is nearest, so rivals spook animals too, and all three species share one fur detail
normal.

**Music** — `src/audio/Music.js`, all at the top: `BPM`, `PROGRESSION` (the chord
voicings as MIDI notes), and the five 16-step patterns `KICK`, `SNARE`, `HAT`, `BASS`
and `ARP`. Change `PROGRESSION` to move the whole track to a different key or mood;
`ARP` indexes into each chord. Volume is the `volume` argument where `Game` constructs
`Music`, and the speed-reactive filter range is in `setIntensity` (5.2 kHz → 16 kHz).

---

## Troubleshooting

**Black screen after `npm run cap:sync`**
`capacitor.config.json` must have `"webDir": "dist"`, and `vite.config.js` must keep
`base: './'`. Capacitor loads from `https://localhost` inside the WebView, so absolute
asset paths (`/assets/...`) fail.

**The APK still shows the old game**
`cap sync` does not run the web build. Use `npm run cap:sync` (or `npm run build`
followed by `npx cap sync android`).

**Low frame rate**
The game auto-degrades to the LOW preset (pixel ratio 1, no shadows) when it cannot
hold ~38 FPS. If you need more, lower `QUALITY_LEVELS[1].maxPixelRatio`, reduce
`ZONES[].density`, or disable shadows in `QUALITY_LEVELS[1]`.

**Mud/puddles look flat or the water is invisible**
Water and mud rely on `transparent` + `depthWrite: false` render ordering. If you add
more transparent geometry, set explicit `renderOrder` values (the river uses 4, the
ford 5).

**Tilt steering does nothing**
On iOS 13+ `DeviceOrientationEvent.requestPermission()` must be called from a user
gesture — the TILT STEER chip does that. On Android it works directly. Requires a
secure context; Capacitor's `https` scheme satisfies this.

**`gradlew` fails with an unsupported class file version**
You are on the wrong JDK. Install JDK 17 and point `org.gradle.java.home` at it in
`android/gradle.properties`, or set `JAVA_HOME`.

**Landscape lock is ignored**
`screen.orientation.lock()` requires fullscreen, which the game requests on START. If
the user denies fullscreen, the lock silently fails and the game still works in
portrait (the HUD adapts and shows a rotate hint).

---

## Licence

MIT.
