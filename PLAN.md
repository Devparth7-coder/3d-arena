# ARENA — Development Plan

Milestone-by-milestone implementation plan for **ARENA**, a browser-based 3D fighting game.
Status legend: ✅ done · 🟡 partial (live but scoped down) · ⬜ not started

> **Working agreement:** one milestone at a time, production build + tests green after each,
> no feature claimed until it has actually run. Everything below marked ✅/🟡 is in this build
> and covered by automated checks (`npm test`, `npm run verify`).

---

## M0 — Project scaffold & architecture ✅

**Goal:** solid technical foundation.

- Vite + React 18 + TypeScript (strict) + Three.js + React Three Fiber + Drei + Zustand.
- **Deterministic fixed-step (60 Hz) simulation decoupled from rendering** (`src/game/` has zero
  THREE/DOM imports). This is the load-bearing decision for Phase 7: the same code can later run
  on a Node server for authoritative online play.
- Presentation subscribes to engine events (`engine.subscribe`) and reads sim state —
  rendering, audio, FX, HUD never feed back into the simulation.
- Engine is unit-tested in Node (13 tests); visual/behavioral flow is verified headlessly
  (`scripts/verify.mjs`, 20 checks).

## M1 — Core fight loop ✅ *(this build)*

**Goal:** it is a game, not a demo.

- Arena "SECTOR 07 GRID": emissive combat platform, boundary pylons, volumetric-style light
  cones, banner screens, instanced skyline, fog, dust; procedurally generated textures
  (zero image assets required).
- Cinematic camera director: dynamic framing by fighter separation, round-intro sweep,
  KO orbit slow-motion, trauma-based screen shake.
- Two rigged skeletal fighters (VOLT / PYRA) with animation state machine, crossfades,
  procedural additive layer for jabs/kicks/blocks/hit-flinches/dodges, morph-target faces,
  EX-charge glow, hit flash.
- Combat: LP/HP/LK/HK with startup/active/recovery frames, range, lunge, knockback,
  hitstun/blockstun, hit-stop, single-hit-per-activation guard, combo counter + damage
  scaling, block chip (can never KO), dodge with i-frames + cooldown, knockdown/getup,
  EX meter (full meter → unblockable empowered heavy), guard-break-free M1 by design.
- Rounds: best of 3, 60 s timer, time-up resolution, PERFECT detection, KO cinematic,
  round reset, match end with stats.
- Sparring AI (Phase-4 preview): distance management, block/dodge reactions, weighted
  move choice, EX usage.
- HUD: health bars with damage-ghost trails, timer, round pips, EX meters, combo counters,
  announcer (ROUND / FIGHT / K.O. / TIME UP / PERFECT / WINS).
- Screens: main menu (live 3D backdrop with idle robot), settings (live volume/quality/shake),
  controls, roadmap, pause, results with per-fighter stats + rematch.
- Audio: fully procedural WebAudio (impacts, blocks, whooshes, KO, UI, menu drone,
  fight loop) — no audio assets.
- FX: particle bursts, shockwave rings, impact flashes, screen flash, bloom + vignette
  (quality-gated).

## M2 — Animation depth & fighter identity 🟡

- Per-character combat move-set (distinct jab/cross/hook/kick anims per fighter).
- More skeletal states: run-stop, hurt variants by height, wall-splat, taunts.
- Animation-quality pass: anticipation/follow-through on all moves, blend-tree polish.
- **Note:** M1 already ships the state machine, crossfade system, and the procedural
  additive layer — M2 fills the content.
- *Status: state machine + 14 clips + procedural layer live; move-set breadth pending.*

## M3 — Physics & combat depth ⬜ (foundations already live)

- Rapier integration for **cosmetic** physics only (debris, sparks, ragdolls on KO) —
  the fighting sim stays deterministic/kinematic for netcode integrity.
- Guard meter + guard breaks, wall pushes/wall splats, juggles & air states,
  throw/command-grab, counter-hit rewards, frame-data viewer (training mode).

## M4 — Real AI opponent ⬜ (sparring preview live)

- Difficulty tiers (Rookie → Master) driving reaction windows, punish accuracy, block rate.
- Personalities: rushdown / zoner / grappler / turtle; adaptive distance management,
  whiff punishment, anti-air logic, combo routes.
- AI-vs-AI spectator mode (free QA tool).

## M5 — Roster, character select & specials ⬜

- Character-select screen with 3D turntable previews, stats, bio, style description.
- 6 fighters with unique silhouettes/speed/power/specials.
- Special moves (quarter-circle/charge inputs) & ultimates consuming the EX meter.
- 5 arenas: futuristic grid (✅ live), Japanese dojo, underground club, cyberpunk rooftop,
  ancient temple — lazy-loaded per match.

## M6 — Local multiplayer ⬜

- Mirrored key map (arrows + numpad), shared camera, separate HUD sides, round-based sets.
- Input abstraction already isolates per-player devices — this milestone is mostly
  content + UI.

## M7 — Online multiplayer ⬜ (architecture already prepared)

- Node + Express + Socket.IO backend; PostgreSQL via Prisma.
- Matchmaking queue + private rooms + invite codes.
- **Server-authoritative combat:** the deterministic `MatchEngine` runs on the server;
  clients send inputs, receive state — client-reported damage is never trusted.
- Rollback-style input delay compensation, reconnection with session resume,
  desync detection.

## M8 — Profiles, ranking & progression ⬜

- Accounts, profiles, match history, ELO/Glicko ladder, leaderboards, XP/unlock cosmetics.

## M9 — Polish & ship ⬜ (ongoing passes each milestone)

- Audio/visual polish, per-fighter voice packs, crowd, replays.
- Performance: instancing audit, texture compression, quality auto-scaling, mobile
  touch controls, PWA install, deploy (static CDN for client + game server).

---

## Verification per milestone

| Check | Command |
| --- | --- |
| Types (strict) | `npm run typecheck` |
| Combat simulation unit tests | `npm test` |
| Production build | `npm run build` |
| Headless visual/behavioral suite (needs dev server) | `npm run dev` + `npm run verify` |

## Risk register

- **WebGL perf on low-end:** quality tiers already live; will add dynamic resolution scaling in M9.
- **Online determinism:** sim is already pure/deterministic and event-driven; the main risk is
  float divergence across JS engines — mitigated by fixed integer-tick stepping (already in place)
  and a planned integerized kinematics pass before M7.
- **Asset pipeline:** current fighter is a CC-BY rigged GLB + procedural layer; the M5 roster
  needs a real asset pipeline (Blender → glTF) — budgeted there.
