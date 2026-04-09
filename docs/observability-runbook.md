# Observability and Redis Runbook

## Check whether Redis is working

1. Check PM2 logs for these messages:
   - `Redis connection established`
   - `Redis connected and ready`
   - `Session store mode in use`

2. Check health endpoints:
   - `GET /health`
   - `GET /api/system/health`

   Healthy Redis should report:
   - `redis.ok: true`
   - `redis.ready: true`
   - `redis.mode: "redis"`

3. Check Redis directly on the server:
   ```bash
   redis-cli -u <REDIS_URL> ping
   redis-cli -u <REDIS_URL> keys "game:*"
   redis-cli -u <REDIS_URL> keys "session:*"
   ```

## Inspect cache

- Inspect all app cache keys:
  - `GET /api/system/cache`
- Inspect one session PIN:
  - `GET /api/system/cache?pin=694490`

These endpoints are admin-protected and return the cache mode plus matching keys.

## Clear cache safely

- Clear one session PIN only:
  - `DELETE /api/system/cache?pin=694490`
- Clear all app session/game cache:
  - `DELETE /api/system/cache`

Do not use `FLUSHALL` unless you intentionally want to wipe the entire Redis database.

## Log files

Server logs are written to:

- `server/logs/combined.log`
- `server/logs/error.log`

PM2 console output still remains available, so you can inspect both live and persisted logs.

### Rotation policy

- Rotation is always enabled.
- Each log file rotates at `10 MB`.
- Development keeps up to `7` rotated files.
- Production keeps up to `14` rotated files.
- Logs are never auto-cleared on startup, deploy, or crash.

### Local fresh-session workflow

Use this before a focused debugging session:

1. Stop the server.
2. Review or copy the current logs if you may need them.
3. Clear local logs:
   ```bash
   npm run logs:clear:local -w server
   ```
4. Restart the server.
5. Use the restart boundary banner in terminal and file logs as the start of the new session.

Do not clear logs immediately after a crash until you have reviewed the evidence.

## How to tell where the system failed

- Client env/config issue:
  - browser debug panel or console shows missing `NEXT_PUBLIC_*`
- API issue:
  - client logs `api request failed`
  - server logs request start/completion with same `x-request-id`
- Socket issue:
  - client logs socket reconnect/disconnect
  - server logs socket connect/disconnect and incoming events
- Redis issue:
  - health endpoint reports `mode: "memory"`
  - server logs fallback warnings
- DB issue:
  - health endpoint reports `database.ok: false`
  - server logs query/authentication failures
