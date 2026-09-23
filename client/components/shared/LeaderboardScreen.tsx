'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  eliminationLeaderboardRowClasses,
  prepareLeaderboardTeams,
} from '@/lib/eliminationLeaderboard';
import { cn, toDisplayUpper } from '@/lib/utils';

export type LeaderboardTeam = {
  teamId: number;
  teamName: string;
  score: number;
  isEliminated?: boolean;
};

export type LeaderboardScreenSize = 'player' | 'venue' | 'host';

const SIZE_CONFIG: Record<
  LeaderboardScreenSize,
  {
    wrapper: string;
    title: string;
    medal: string;
    panel: string;
    panelPad: string;
    colHeader: string;
    rowGap: string;
    rowPy: string;
    rowPx: string;
    nameText: string;
    scoreText: string;
    rankText?: string;
  }
> = {
  player: {
    wrapper: 'px-0 py-1',
    title: 'text-[30px] font-bold leading-none tracking-normal',
    medal: 'h-[46px] w-[46px]',
    panel: 'w-full max-w-[400px]',
    panelPad: 'px-0 py-0',
    colHeader: 'text-[10px] sm:text-xs',
    rowGap: 'gap-[30px]',
    rowPy: 'py-0',
    rowPx: 'px-[10px]',
    nameText: 'text-center text-[20px] font-bold leading-[30px]',
    scoreText: 'min-w-[48px] text-right text-[20px] font-bold leading-[30px]',
  },
  // Venue renders inside the fixed 1920×1080 stage, so sizes are absolute: viewport
  // breakpoints would resolve against the physical screen and desync from the stage.
  // Figma 776:18374 — 1770×970 board, 800×70 rows, ExtraBold 30 / SemiBold rank 30.
  venue: {
    wrapper: 'px-[75px] pb-[12px] pt-[28px]',
    title: 'text-[40px] font-black leading-none tracking-normal drop-shadow-none',
    medal: 'h-[66px] w-[66px]',
    panel: 'w-full max-w-[1770px]',
    panelPad: 'px-[40px] py-[24px]',
    colHeader: 'text-lg',
    rowGap: 'gap-5',
    rowPy: 'py-0',
    rowPx: 'px-3',
    nameText: 'text-center text-[30px] font-extrabold leading-none',
    scoreText: 'min-w-[220px] text-center text-[30px] font-extrabold leading-none',
    rankText: 'text-[30px] font-semibold leading-4',
  },
  host: {
    wrapper: 'px-0 py-0',
    title: 'text-xl sm:text-2xl',
    medal: 'h-8 w-8',
    panel: 'w-full',
    panelPad: 'px-0 py-0',
    colHeader: 'text-xs',
    rowGap: 'gap-1.5',
    rowPy: 'py-2',
    rowPx: 'px-3',
    nameText: 'text-sm sm:text-base',
    scoreText: 'text-sm sm:text-base',
  },
};

function LeaderboardScene({
  showScene,
  size,
}: {
  showScene: boolean;
  size: LeaderboardScreenSize;
}) {
  if (!showScene || size === 'venue') return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 opacity-[0.14]" aria-hidden />
      <div
        className="pointer-events-none absolute -left-[8%] -top-[6%] h-[42%] w-[42%] opacity-70"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,220,120,0.42) 0%, rgba(255,200,80,0.12) 38%, transparent 72%)',
        }}
      />
      <div
        className="pointer-events-none absolute -right-[8%] -top-[6%] h-[42%] w-[42%] opacity-70"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(255,220,120,0.42) 0%, rgba(255,200,80,0.12) 38%, transparent 72%)',
        }}
      />
      <div
        className="leaderboard-checkered-floor pointer-events-none absolute inset-x-0 bottom-0 h-[28%]"
        aria-hidden
      />
    </>
  );
}

function playerRankFill(rank: number): string {
  if (rank === 1) return 'linear-gradient(180deg, #FFD900 0%, #FF7700 100%)';
  if (rank === 2) return 'linear-gradient(180deg, #C5E3FF 0%, #657297 100%)';
  if (rank === 3) return 'linear-gradient(180deg, #BF4900 0%, #7E3B00 100%)';
  return 'linear-gradient(180deg, #100048 0%, #0B0F1A 100%)';
}

function venueRankFill(rank: number): string {
  if (rank === 1) return 'linear-gradient(180deg, #DA9500 0%, #FF8000 100%)';
  if (rank === 2) return 'linear-gradient(180deg, #C5E3FF 0%, #657297 100%)';
  if (rank === 3) return 'linear-gradient(180deg, #BF4900 0%, #7E3B00 100%)';
  return 'linear-gradient(180deg, #100048 0%, #0B0F1A 100%)';
}

function LeaderboardColumn({
  teams,
  size,
  highlightTeamId,
  isPlayer,
  cfg,
  startRank = 1,
  eliminationStyle = false,
}: {
  teams: LeaderboardTeam[];
  size: LeaderboardScreenSize;
  highlightTeamId: number | null;
  isPlayer: boolean;
  cfg: (typeof SIZE_CONFIG)[LeaderboardScreenSize];
  startRank?: number;
  eliminationStyle?: boolean;
}) {
  const isVenue = size === 'venue';

  return (
    <div className={cn('flex min-w-0 w-full flex-col', cfg.rowGap)}>
      {teams.map((team, idx) => {
        const isMe = isPlayer && highlightTeamId != null && team.teamId === highlightTeamId;
        const score = Number(team.score ?? 0);
        const rank = startRank + idx;

        const showEliminated = eliminationStyle && team.isEliminated;
        const showSurvivor = eliminationStyle && !team.isEliminated;
        const isEmptySlot = isVenue && !team.teamName;

        return (
          <div
            key={team.teamId}
            data-leaderboard-row
            className={cn(
              'relative items-center',
              isPlayer
                ? 'grid h-[57px] w-full grid-cols-[30px_1fr_auto] rounded-[10px] border border-[rgba(0,217,255,0.4)]'
                : isVenue
                  ? 'grid h-[70px] w-full grid-cols-[48px_1fr_auto] rounded-[20px] border-2 border-[#00D9FF]'
                  : 'grid grid-cols-[1fr_auto] rounded-xl border border-white/20 bg-white/5',
              cfg.rowPy,
              cfg.rowPx,
              showEliminated && eliminationLeaderboardRowClasses.eliminated,
              showSurvivor && eliminationLeaderboardRowClasses.survivor,
              isMe && !isPlayer &&
                'z-10 scale-[1.02] border-white/60 ring-2 ring-white/80 ring-offset-1 ring-offset-[#0b0524]',
              isMe && isPlayer && 'z-10 border-white shadow-[0_0_15px_rgba(0,217,255,0.6)]',
            )}
            style={
              isPlayer
                ? { background: 'linear-gradient(180deg, #03006E 0%, #00010A 100%)' }
                : isVenue
                  ? { background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)' }
                  : undefined
            }
          >
            {isMe && !isPlayer ? (
              <span className="pointer-events-none absolute -top-2 right-2 rounded-full border border-white/60 bg-[#0b0524] px-2 py-[1px] text-[9px] font-black uppercase tracking-[0.16em] text-white sm:text-[10px]">
                You
              </span>
            ) : null}

            {isVenue || isPlayer ? (
              <div
                className={cn(
                  'text-center tabular-nums text-white',
                  isPlayer
                    ? 'flex size-[30px] items-center justify-center rounded-[4px] text-[18px] font-semibold leading-4 [text-shadow:0_2px_2px_rgba(0,0,0,0.4)]'
                    : isVenue
                      ? 'flex h-[53px] w-[48px] items-center justify-center rounded-[4px] font-semibold [text-shadow:0_2px_2px_rgba(0,0,0,0.5)] [filter:drop-shadow(0_4px_2px_rgba(0,0,0,0.5))]'
                      : (cfg.rankText ?? cfg.scoreText),
                  isVenue && cfg.rankText,
                )}
                style={
                  isPlayer
                    ? { background: playerRankFill(rank) }
                    : isVenue
                      ? { background: venueRankFill(rank), color: '#FFFFFF' }
                      : undefined
                }
              >
                {rank}
              </div>
            ) : null}

            <div
              className={cn(
                'min-w-0 truncate uppercase text-white',
                isVenue ? 'font-extrabold' : 'font-bold',
                cfg.nameText,
                showEliminated && 'line-through decoration-white/40',
              )}
            >
              {isEmptySlot ? '' : toDisplayUpper(team.teamName)}
            </div>

            <div
              className={cn(
                'text-right text-white',
                isVenue ? 'font-extrabold' : 'font-extrabold',
                cfg.scoreText,
                showEliminated && 'text-white/45',
              )}
            >
              {isEmptySlot
                ? ''
                : isVenue
                  ? `${score} Points`
                  : `${score >= 0 ? '+' : ''}${score}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** `refresh` reports position without moving — used when the host reloads mid-leaderboard. */
export type LeaderboardScrollDirection = 'up' | 'down' | 'top' | 'bottom' | 'refresh';

/** Reported to the host so remote scroll buttons know when they'd be a no-op. */
export type LeaderboardScrollState = {
  canScrollUp: boolean;
  canScrollDown: boolean;
  firstVisibleRow: number;
  lastVisibleRow: number;
  totalRows: number;
};

export interface LeaderboardScreenProps {
  teams: LeaderboardTeam[];
  size?: LeaderboardScreenSize;
  highlightTeamId?: number | null;
  className?: string;
  /** Full game-show scene (spotlights, floor). Off for host modal shell. */
  showScene?: boolean;
  emptyMessage?: string;
  titleId?: string;
  /** Elimination round only: survivor/neon + grey knockouts and special sort. */
  eliminationStyle?: boolean;
  /**
   * Venue: remote scroll driven by the host. `nonce` must change per press so repeating the
   * same direction scrolls again.
   */
  scrollRequest?: { direction: LeaderboardScrollDirection; nonce: number } | null;
  onScrollStateChange?: (state: LeaderboardScrollState) => void;
}

export function LeaderboardScreen({
  teams,
  size = 'player',
  highlightTeamId = null,
  className,
  showScene = true,
  emptyMessage = 'No teams on the leaderboard yet',
  titleId,
  eliminationStyle = false,
  scrollRequest = null,
  onScrollStateChange,
}: LeaderboardScreenProps) {
  const cfg = SIZE_CONFIG[size];
  const isPlayer = size === 'player';
  const isVenue = size === 'venue';
  const listAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const appliedScrollNonceRef = useRef<number | null>(null);
  const VENUE_COLUMN_SIZE = 10;
  const VENUE_PAGE_SIZE = VENUE_COLUMN_SIZE * 2;
  const displayTeams = useMemo(() => {
    const prepared = prepareLeaderboardTeams(teams, eliminationStyle);
    if (size !== 'venue') return prepared;
    // Figma 776:18374 is always 2×10. Extra teams become the next 2×10 page.
    const padTo = Math.max(
      VENUE_PAGE_SIZE,
      Math.ceil(prepared.length / VENUE_PAGE_SIZE) * VENUE_PAGE_SIZE,
    );
    if (prepared.length >= padTo) return prepared;
    return [
      ...prepared,
      ...Array.from({ length: padTo - prepared.length }, (_, i) => ({
        teamId: -1000 - i,
        teamName: '',
        score: 0,
        isEliminated: false,
      })),
    ];
  }, [teams, eliminationStyle, size]);
  const teamsKey = displayTeams
    .map((t) => `${t.teamId}:${t.score}:${t.isEliminated ? 1 : 0}`)
    .join('|');

  const useVenueSplit = isVenue && displayTeams.length > 0;
  const venuePages = useMemo(() => {
    if (!useVenueSplit) return [];
    const pages: { left: LeaderboardTeam[]; right: LeaderboardTeam[]; startRank: number }[] = [];
    for (let i = 0; i < displayTeams.length; i += VENUE_PAGE_SIZE) {
      pages.push({
        left: displayTeams.slice(i, i + VENUE_COLUMN_SIZE),
        right: displayTeams.slice(i + VENUE_COLUMN_SIZE, i + VENUE_PAGE_SIZE),
        startRank: i + 1,
      });
    }
    return pages;
  }, [useVenueSplit, displayTeams]);

  /**
   * Row pitch in px (row height + gap). Rows are uniform inside the fixed venue stage, so
   * stepping by whole rows guarantees the projector never shows a half-cut row.
   */
  const measureRowPitch = useCallback(() => {
    const area = scrollAreaRef.current;
    if (!area) return 0;
    const rows = area.querySelectorAll<HTMLElement>('[data-leaderboard-row]');
    const first = rows[0];
    if (!first) return 0;
    // In split mode the next row may sit in the right column at the same offset — find the
    // first row that is genuinely lower.
    for (let i = 1; i < rows.length; i += 1) {
      const delta = rows[i].offsetTop - first.offsetTop;
      if (delta > 0) return delta;
    }
    return first.offsetHeight;
  }, []);

  const reportScrollState = useCallback(() => {
    const area = scrollAreaRef.current;
    if (!area || !onScrollStateChange) return;
    const pitch = measureRowPitch();
    const maxScroll = Math.max(0, area.scrollHeight - area.clientHeight);
    const totalRows = pitch > 0 ? Math.max(1, Math.round(area.scrollHeight / pitch)) : 0;
    const rowsPerView = pitch > 0 ? Math.max(1, Math.floor(area.clientHeight / pitch)) : 0;
    const firstVisibleRow = pitch > 0 ? Math.round(area.scrollTop / pitch) + 1 : 0;
    onScrollStateChange({
      canScrollUp: area.scrollTop > 1,
      canScrollDown: area.scrollTop < maxScroll - 1,
      firstVisibleRow,
      lastVisibleRow: Math.min(totalRows, firstVisibleRow + rowsPerView - 1),
      totalRows,
    });
  }, [measureRowPitch, onScrollStateChange]);

  useEffect(() => {
    const area = scrollAreaRef.current;
    if (!area || !onScrollStateChange) return;

    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reportScrollState);
    };

    area.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(area);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener('scroll', schedule);
      ro.disconnect();
    };
  }, [onScrollStateChange, reportScrollState, teamsKey, useVenueSplit]);

  /** New standings always start from the top — the host shouldn't have to scroll back. */
  useEffect(() => {
    scrollAreaRef.current?.scrollTo({ top: 0 });
  }, [teamsKey]);

  useEffect(() => {
    const area = scrollAreaRef.current;
    if (!area || !scrollRequest) return;
    if (appliedScrollNonceRef.current === scrollRequest.nonce) return;
    appliedScrollNonceRef.current = scrollRequest.nonce;

    if (scrollRequest.direction === 'refresh') {
      reportScrollState();
      return;
    }

    const maxScroll = Math.max(0, area.scrollHeight - area.clientHeight);
    if (maxScroll <= 0) {
      reportScrollState();
      return;
    }

    const pitch = measureRowPitch();
    const step =
      pitch > 0 ? Math.max(1, Math.floor(area.clientHeight / pitch)) * pitch : area.clientHeight;

    let target: number;
    switch (scrollRequest.direction) {
      case 'top':
        target = 0;
        break;
      case 'bottom':
        target = maxScroll;
        break;
      case 'up':
        target = area.scrollTop - step;
        break;
      default:
        target = area.scrollTop + step;
    }

    if (pitch > 0 && (scrollRequest.direction === 'up' || scrollRequest.direction === 'down')) {
      target = Math.round(target / pitch) * pitch;
    }

    area.scrollTo({ top: Math.min(maxScroll, Math.max(0, target)), behavior: 'smooth' });
  }, [scrollRequest, measureRowPitch, reportScrollState]);

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden',
        cfg.wrapper,
        className,
      )}
    >
      <LeaderboardScene showScene={showScene} size={size} />

      <div className="relative z-10 flex h-full min-h-0 w-full max-h-full flex-col items-center">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center',
            isVenue ? 'mb-5 gap-5' : isPlayer ? 'mb-8 gap-3' : 'mb-3 gap-3 sm:mb-4 sm:gap-5 md:gap-6',
          )}
        >
          <img
            src="/leaderboardIcon.png"
            alt=""
            className={cn(
              'object-contain drop-shadow-[0_4px_12px_rgba(255,200,60,0.45)]',
              cfg.medal,
            )}
          />
          <h2
            id={titleId}
            className={cn(
              'font-black uppercase tracking-[0.08em] text-white drop-shadow-[0_0_14px_rgba(255,255,255,0.25)]',
              cfg.title,
            )}
          >
            LEADERBOARD
          </h2>
          <img
            src="/leaderboardIcon.png"
            alt=""
            className={cn(
              'object-contain drop-shadow-[0_4px_12px_rgba(255,200,60,0.45)]',
              cfg.medal,
            )}
          />
        </div>

        <div
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col overflow-hidden',
            isPlayer
              ? 'bg-transparent'
              : isVenue
                ? 'rounded-[30px] border-4 border-[#00D9FF] bg-gradient-to-b from-[#00072F] to-[#00010A] shadow-[0_0_10px_#1A00FF,0_0_10px_#1A00FF]'
                : 'rounded-2xl border border-white/15 bg-[rgba(8,4,28,0.72)] shadow-[0_0_32px_rgba(80,40,180,0.35)] backdrop-blur-sm',
            cfg.panel,
            cfg.panelPad,
          )}
        >
          {!isVenue && !isPlayer ? (
            <div
              className={cn(
                'mb-2 grid shrink-0 grid-cols-[1fr_auto] items-center font-bold uppercase tracking-[0.12em] text-white/90 sm:mb-3',
                cfg.colHeader,
              )}
            >
              <div>Team Name</div>
              <div className="text-right">Score</div>
            </div>
          ) : null}

          {displayTeams.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/45">{emptyMessage}</p>
          ) : (
            <div ref={listAreaRef} className="min-h-0 flex-1 overflow-hidden">
              <div
                ref={scrollAreaRef}
                className="h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]"
              >
                {useVenueSplit ? (
                  <div ref={contentRef} className="flex w-full flex-col gap-5">
                    {venuePages.map((page) => (
                      <div
                        key={page.startRank}
                        className="grid w-full grid-cols-2 items-start gap-[80px]"
                        style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}
                      >
                        <LeaderboardColumn
                          teams={page.left}
                          size={size}
                          highlightTeamId={highlightTeamId}
                          isPlayer={isPlayer}
                          cfg={cfg}
                          startRank={page.startRank}
                          eliminationStyle={eliminationStyle}
                        />
                        <LeaderboardColumn
                          teams={page.right}
                          size={size}
                          highlightTeamId={highlightTeamId}
                          isPlayer={isPlayer}
                          cfg={cfg}
                          startRank={page.startRank + VENUE_COLUMN_SIZE}
                          eliminationStyle={eliminationStyle}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div ref={contentRef}>
                    <LeaderboardColumn
                      teams={displayTeams}
                      size={size}
                      highlightTeamId={highlightTeamId}
                      isPlayer={isPlayer}
                      cfg={cfg}
                      eliminationStyle={eliminationStyle}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
