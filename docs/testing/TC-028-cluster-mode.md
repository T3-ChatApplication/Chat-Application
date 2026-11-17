# TC-028 (NFR-14): cluster mode, what was built and how to prove it

Baseline: `fb81f2b` plus Hema's design addendum (`TC-028-horizontal-scaling.md`).
The addendum is the design; this change is a first, smaller implementation of it.

## What changed

| File | Change |
| --- | --- |
| `server/src/socket/cluster.js` (new) | `REDIS_URL` set -> Socket.IO uses the Redis Streams adapter, so events reach sockets on every instance. Not set -> nothing changes. |
| `server/src/socket/presence.js` | In cluster mode "who is online" is asked of the whole cluster (`fetchSockets`), not read from this process's Map. "Offline" is announced after a 1 s re-check (`PRESENCE_GRACE_MS`). Single-process behaviour is unchanged. |
| `server/src/socket/index.js` | `sent` / `delivered` decision uses cluster-wide presence; user id also stored in `socket.data` so other instances can see it; connection-state recovery is off in cluster mode (addendum: re-check room membership on every reconnect). |
| `server/src/app.js`, `server/src/index.js` | `/api/health` `onlineUsers` is cluster-wide; adapter attached before listening and closed on shutdown. |
| `server/test/cluster.test.js` (new) | Two real server instances in one process joined by a bus adapter built on Socket.IO's `ClusterAdapter`. 6 tests. |
| `server/scripts/cluster-check.mjs` (new) | Live check against two real processes and real Redis. |

## Evidence

| Claim | Evidence | Status |
| --- | --- | --- |
| Message from instance A reaches a user on B and is marked `delivered` | `cluster.test.js` 1 | Run: pass |
| User on no instance is marked `sent` | `cluster.test.js` 2 | Run: pass |
| Presence list/updates cover users on the other instance | `cluster.test.js` 3 | Run: pass |
| One tab per instance: user stays online until the last closes | `cluster.test.js` 4 | Run: pass |
| Typing and room messages cross instances; non-member gets nothing | `cluster.test.js` 5, 6 | Run: pass |
| Tests detect the old defect | With presence forced back to local-only, tests 1, 3, 4 fail; restored, 6/6 pass | Run |
| Whole suite | `npm test`: 77 tests, 0 failing (71 existing + 6 new) | Run |
| Redis wiring (`cluster.js`) with real Redis | `cluster-check.mjs` | **Not run yet** |
| Behind a load balancer / polling fallback with affinity | - | **Not run** |

The automated test replaces Redis with an in-process bus. It proves the application
logic is correct when state is spread over instances; it does not prove the Redis
connection code, which is about ten lines and has not been executed.

## Run the live check (Windows PowerShell)

```
# Redis (pick one):  docker run -p 6379:6379 redis:7     or Redis in WSL
cd server
npm install redis @socket.io/redis-streams-adapter     # then commit package.json and package-lock.json

# terminal 1
$env:PORT=5000; $env:REDIS_URL='redis://localhost:6379'; npm run dev
# terminal 2
$env:PORT=5001; $env:REDIS_URL='redis://localhost:6379'; npm run dev
# terminal 3
node scripts/cluster-check.mjs
```

Expect six `PASS` lines and `CLUSTER_CHECK_RESULT {... "failed":0}`. Screenshot terminals 1-3.
Negative control (optional, good evidence): start both instances **without** `REDIS_URL`
and run the script again; the presence and message checks should FAIL.

## Not done (still open against the addendum)

- **Rate limits are per instance.** The per-user message limit holds if a user's socket
  stays on one instance (sticky sessions); the per-IP API/auth limits are multiplied by
  the number of instances. Shared counters in Redis were not built.
- **Room join/leave** uses `socketsJoin`/`socketsLeave`, which the adapter does apply on all
  instances, but without the per-node acknowledgement the addendum asks for.
- **No Redis-outage handling** (readiness endpoint, retryable errors) and no crash lease; a
  dead instance's users disappear once the adapter notices it. Not measured.
- **Latency:** each one-to-one send now asks the cluster whether the receiver is online. Not
  measured with real Redis; NFR-1 (5 s) should be re-checked with `loadtest.mjs` in cluster mode.
- **Sticky sessions or websocket-only** are still required behind a load balancer.

## Corrections for the existing reports

- DEF-01 and `evidence/inspection.txt` list "unread state" as process memory. It is not:
  `unreadController.js:24` `new Map(...)` is a variable inside one request; unread
  state is in MongoDB (`ReadState`). Only presence and rate-limit windows were process-local.
- `findstr /s /i "redis adapter" src\*.js  -> expect no output` (System Validation Report 5.7)
  is no longer true; replace it with the live check above.

## Suggested register wording

Until `cluster-check.mjs` has been run against real Redis:

> TC-028 - PASS (design inspection + automated two-instance test). Cluster mode implemented
> behind `REDIS_URL`; presence, delivery status, typing and room events verified across two
> server instances with a bus adapter (6 tests). Live Redis run pending. Shared rate limits,
> membership acknowledgements and outage handling remain open (DEF-01, reduced).

After a clean live run, replace "Live Redis run pending" with the screenshot reference.
