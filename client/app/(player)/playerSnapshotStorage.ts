import { PUBLIC_API_URL } from '@/lib/env';

const SNAPSHOT_PREFIX = 'mst:playPlayerSnapshot:';

export type PlayerRestoreReplay = { event: string; data: unknown };

export type PlayerRestoreBundle = {
  sessionPayload: Record<string, unknown>;
  replays: PlayerRestoreReplay[];
};

export type PlayerSnapshotV1 = {
  v: 1;
  savedAt: number;
  pin: string;
  teamId: number;
  sessionPayload: Record<string, unknown> | null;
  replays: PlayerRestoreReplay[];
};

const MAX_REPLAYS = 48;

export function playerSnapshotStorageKey(pin: string, teamId: number) {
  return `${SNAPSHOT_PREFIX}${pin}:${teamId}`;
}

function emptySnapshot(pin: string, teamId: number): PlayerSnapshotV1 {
  return { v: 1, savedAt: Date.now(), pin, teamId, sessionPayload: null, replays: [] };
}

export function readPlayerSnapshot(pin: string, teamId: number): PlayerSnapshotV1 | null {
  if (!pin || teamId == null || !Number.isFinite(Number(teamId))) return null;
  try {
    const raw = sessionStorage.getItem(playerSnapshotStorageKey(pin, Number(teamId)));
    if (!raw) return null;
    const o = JSON.parse(raw) as PlayerSnapshotV1;
    if (o?.v !== 1 || o.pin !== pin || Number(o.teamId) !== Number(teamId)) return null;
    if (!Array.isArray(o.replays)) o.replays = [];
    return o;
  } catch {
    return null;
  }
}

function writeSnapshot(s: PlayerSnapshotV1) {
  try {
    sessionStorage.setItem(playerSnapshotStorageKey(s.pin, s.teamId), JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

/** New `session_state` — replace payload and clear replay tail (same as server join ordering). */
export function setSnapshotSessionPayload(pin: string, teamId: number, sessionPayload: unknown) {
  const tid = Number(teamId);
  if (!pin || !Number.isFinite(tid)) return;
  const prev = readPlayerSnapshot(pin, tid) || emptySnapshot(pin, tid);
  prev.sessionPayload = sessionPayload as Record<string, unknown>;
  prev.replays = [];
  prev.savedAt = Date.now();
  writeSnapshot(prev);
}

export function appendSnapshotReplay(pin: string, teamId: number, event: string, data: unknown) {
  const tid = Number(teamId);
  if (!pin || !Number.isFinite(tid)) return;
  const prev = readPlayerSnapshot(pin, tid) || emptySnapshot(pin, tid);
  if (event === 'answer_reveal') {
    prev.replays = prev.replays.filter((r) => r.event !== 'answer_reveal');
  }
  if (event === 'scoreboard') {
    prev.replays = prev.replays.filter((r) => r.event !== 'scoreboard');
  }
  if (event === 'break_start') {
    prev.replays = prev.replays.filter((r) => r.event !== 'break_start');
  }
  prev.replays.push({ event, data });
  if (prev.replays.length > MAX_REPLAYS) {
    prev.replays = prev.replays.slice(-MAX_REPLAYS);
  }
  prev.savedAt = Date.now();
  writeSnapshot(prev);
}

export function setSnapshotFromRemoteBundle(
  pin: string,
  teamId: number,
  bundle: PlayerRestoreBundle,
) {
  const tid = Number(teamId);
  if (!pin || !Number.isFinite(tid) || !bundle?.sessionPayload) return;
  const s: PlayerSnapshotV1 = {
    v: 1,
    savedAt: Date.now(),
    pin,
    teamId: tid,
    sessionPayload: bundle.sessionPayload,
    replays: Array.isArray(bundle.replays) ? bundle.replays : [],
  };
  writeSnapshot(s);
}

export function clearPlayerSnapshot(pin: string, teamId: number) {
  try {
    sessionStorage.removeItem(playerSnapshotStorageKey(pin, Number(teamId)));
  } catch {
    /* ignore */
  }
}

export function snapshotToRestoreBundle(snap: PlayerSnapshotV1 | null): PlayerRestoreBundle | null {
  if (!snap?.sessionPayload) return null;
  return {
    sessionPayload: snap.sessionPayload,
    replays: snap.replays || [],
  };
}

export async function fetchPlayerRestore(
  pin: string,
  teamId: number,
  signal?: AbortSignal,
): Promise<PlayerRestoreBundle | null> {
  if (!pin || !Number.isFinite(Number(teamId))) return null;
  try {
    const res = await fetch(
      `${PUBLIC_API_URL}/api/public/sessions/pin/${encodeURIComponent(pin)}/player-restore?teamId=${encodeURIComponent(String(teamId))}`,
      { cache: 'no-store', signal },
    );
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: PlayerRestoreBundle;
    };
    if (!res.ok || !json?.success || !json.data?.sessionPayload) return null;
    return json.data;
  } catch {
    return null;
  }
}

/** Apply HTTP/local bundle using raw socket event names as keys. */
export function applyPlayerRestoreBundle(
  bundle: PlayerRestoreBundle | null | undefined,
  handlers: Partial<Record<string, (data: unknown) => void>>,
) {
  if (!bundle?.sessionPayload) return;
  const onSession = handlers.session_state;
  if (onSession) onSession(bundle.sessionPayload);
  for (const r of bundle.replays || []) {
    const fn = handlers[r.event];
    if (fn) fn(r.data);
  }
}
