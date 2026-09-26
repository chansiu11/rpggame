# Shared world player combat

The arena still uses its existing PeerJS connection and Render matchmaking queue.
The world keeps its WebSocket connection, monsters, quests, account/save paths and UI.
No save migration or progress reset is performed.

## Shared execution and data

`combatTargets()` adds transient player adapters only to combat target searches. They
never enter monster AI, rewards, persistence or loot. The existing sword sequence,
hold, hidden sword and projectile functions now execute once for both kinds of target.
`hitEnemy`, `moveBody` and `applyEnemyStun` route player adapters into combat intents.
The previous second player-only hit pass has been removed to prevent duplicate hits.

`EchoesWorldPvpData` remains the source of skill names, costs, cooldowns, sword cfg
multipliers/timings/ranges and effects for the arena. There is no second world-PVP
skill library. New skills should use `combatTargets()`/`hitEnemy`/`moveBody` and
`applyEnemyStun` instead of accessing a network socket.

`multiplayer-server/combat-core.js` is loaded by both browser contexts and the server.
It shares arena hit geometry, cubic forced movement, shield cost and armor damage.
Arena matchmaking, protocol, scoring, PeerJS handlers and skill dispatch stay intact;
only these deterministic calculations delegate to the common module.

## Wire contract (combat protocol 1)

| Message | Direction | Meaning |
| --- | --- | --- |
| `world:combat` | Client → server | Ordered `seq` and bounded `events`; `kind` is `attack`, `control`, or `special` |
| `world:combatResult` | Server → nearby clients | Unique `eventId`, attacker/target, outcome, actual damage, authoritative player snapshot |
| `world:teleport` | Client → server | Self movement state with normal input sequence and combat acknowledgement; cannot escape active control |
| `state` / `player:self` / `player:state` | Both | Movement, resources, facing, gear/style, skill/animation, defensive and special state |
| `skill:fx` | Both | Existing skill ID, slot and origin; client builds sword trails and particles |
| `skill:effects` | Both | Existing envelope, now projectile launch parameters only; server discards effect arrays |

An attack includes target ID, damage, range, optional shape, skill ID, stun, force and
shield flags. `dx/dy` are relative forced movement; `x/y` on control events are absolute
tracking targets. Attack-shape coordinates are never treated as forced destinations.
Special control supports shield break and timed marks. The recipient's authoritative
position is used for validation and movement origins.

Snapshots carry `combatRevision`, `controlRevision`, `teleportSeq`, HP, shield/max,
stamina/max, block, parry window, invulnerability, dash, stun, shield timers, marks,
force trajectory, skill ID/kind and bounded special state (hold, Void 3, movement scale).
`combatAck` on client state acknowledges the entire last applied result. Older input
sequences are rejected. Unacknowledged snapshots cannot restore HP/resources/position.
Acknowledged input still cannot move a character until its force/stun lease ends.
The server advances movement independently of browser focus or frame rate; the client
applies the same trajectory before/after ordinary input and skill movement.

Server validation covers alive/world participants, distance/contact geometry, region,
party, duplicate sequences, packet/event limits, timed defenses and control ownership.
A recent accepted hit is required before its attacker can send follow-up control or
special state. Blocked/parried/immune hits do not grant that lease. It is a validated
combat-event system, not a complete server simulation of every attack/cooldown or a
replacement for account authentication and anti-cheat.

## Regional policy and traffic

Edit `WORLD_COMBAT_POLICY` in `multiplayer-server/server.js`. `enabled: false` disables
world player attacks. `defaultMode` is `combat`; the existing village circles are `safe`.
Add circles with mode `pvp` for always-hostile areas (both players must be in such an
area to override party protection). Safe areas take precedence in the configured order.
The policy is advertised in `hello:ok` for matching client target eligibility.

Combat/fast state/visual updates are scoped to 2,200 world units; attacker and victim
always receive their result. Global low-rate roster updates remain for discovery.
Particles are not transmitted. Projectile trajectories are sent once, then animated
locally. Force updates run at 20 Hz; ordinary state retains its existing ~30 Hz cadence.
The existing world navigation obstacles clip forced destinations without changing
monster navigation.

## Verification

From `multiplayer-server`: `npm ci && npm test`.

For the optional real-browser suite install Playwright in the repository root
(`npm install --no-save playwright`, `npx playwright install chromium`), then run
`node tests/browser-world-combat.cjs`. `CHROMIUM_EXECUTABLE_PATH` can select an already
installed Chromium. The suite uses local HTTP/WS servers and isolated test accounts;
cloud calls are blocked. It never connects test clients to Render.

Verified locally: syntax of all inline/external JavaScript; 14 automated assertions
covering real 2-client WebSocket combat and arena matchmaking, stale/duplicate events,
force settlement/absolute tracking, teleport locks, shield/parry/invulnerability,
marks, armor and safe/party rules. Two isolated Chromium game pages verify active
movement input cannot cancel knockback and stale combat results cannot restore HP.
The runtime sweep exercises all 25 equipped sword skills, 5 hidden-sword skills and
5 bow skills against player adapters and checks they emit combat events without JS
errors. This sweep checks execution and routing, not every possible match outcome.
Real Internet PeerJS matches, mobile touch devices and high-latency load testing are
not part of this local automated suite.

Deploy the server and static files together, then refresh existing clients. The
existing Render Blueprint already has `autoDeploy: true`; the server handshake and
health response advertise `combatProtocol: 1` when this version is running.
