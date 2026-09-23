'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    wrapper: 'px-3 py-4 sm:px-4 sm:py-6',
    title: 'text-[clamp(1.65rem,5.5vw,2.35rem)]',
    medal: 'h-8 w-8 sm:h-10 sm:w-10',
    panel: 'w-full max-w-[min(26rem,94vw)]',
    panelPad: 'px-3 py-3 sm:px-4 sm:py-4',
    colHeader: 'text-[10px] sm:text-xs',
    rowGap: 'gap-1.5 sm:gap-2',
    rowPy: 'py-2 sm:py-2.5',
    rowPx: 'px-2 sm:px-3',
    nameText: 'text-sm sm:text-base',
    scoreText: 'text-sm sm:text-base',
  },
  // Venue renders inside the fixed 1920×1080 stage, so sizes are absolute: viewport
  // breakpoints would resolve against the physical screen and desync from the stage.
  venue: {
    wrapper: 'p-8',
    title: 'text-[clamp(2.25rem,4.5cqh,3.75rem)]',
    medal: 'h-14 w-14',
    panel: 'w-full max-w-[min(98cqw,88rem)]',
    panelPad: 'px-8 py-6',
    colHeader: 'text-lg',
    rowGap: 'gap-4',
    rowPy: 'py-5',
    rowPx: 'px-6',
    nameText: 'text-5xl font-normal leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]',
    scoreText: 'text-5xl font-normal leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]',
    rankText: 'text-5xl font-normal leading-none drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]',
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
    <div className={cn('flex min-w-0 flex-1 flex-col', cfg.rowGap)}>
      {teams.map((team, idx) => {
        const isMe = isPlayer && highlightTeamId != null && team.teamId === highlightTeamId;
        const score = Number(team.score ?? 0);
        const rank = startRank + idx;

        const showEliminated = eliminationStyle && team.isEliminated;
        const showSurvivor = eliminationStyle && !team.isEliminated;

        return (
          <div
            key={team.teamId}
            data-leaderboard-row
            className={cn(
              'relative items-center rounded-xl border border-white/20 bg-white/5',
              isVenue
                ? 'grid grid-cols-[minmax(4.5rem,auto)_1fr_minmax(6rem,auto)]'
                : 'grid grid-cols-[1fr_auto]',
              cfg.rowPy,
              cfg.rowPx,
              showEliminated && eliminationLeaderboardRowClasses.eliminated,
              showSurvivor && eliminationLeaderboardRowClasses.survivor,
              isMe &&
                'z-10 scale-[1.02] border-white/60 ring-2 ring-white/80 ring-offset-1 ring-offset-[#0b0524]',
            )}
          >
            {isMe ? (
              <span className="pointer-events-none absolute -top-2 right-2 rounded-full border border-white/60 bg-[#0b0524] px-2 py-[1px] text-[9px] font-black uppercase tracking-[0.16em] text-white sm:text-[10px]">
                You
              </span>
            ) : null}

            {isVenue ? (
              <div
                className={cn('text-center tabular-nums text-white', cfg.rankText ?? cfg.scoreText)}
              >
                {rank}
              </div>
            ) : null}

            <div
              className={cn(
                'min-w-0 truncate uppercase text-white',
                isVenue ? 'text-center font-normal' : 'font-bold',
                cfg.nameText,
                showEliminated && 'line-through decoration-white/40',
              )}
            >
              {toDisplayUpper(team.teamName)}
            </div>

            <div
              className={cn(
                'text-right text-white',
                isVenue ? 'font-normal' : 'font-extrabold',
                cfg.scoreText,
                showEliminated && 'text-white/45',
              )}
            >
              {score}
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
  const [venueSplit, setVenueSplit] = useState(false);
  const listAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const appliedScrollNonceRef = useRef<number | null>(null);
  const teamsKeyRef = useRef('');
  const displayTeams = useMemo(
    () => prepareLeaderboardTeams(teams, eliminationStyle),
    [teams, eliminationStyle],
  );
  const teamsKey = displayTeams
    .map((t) => `${t.teamId}:${t.score}:${t.isEliminated ? 1 : 0}`)
    .join('|');

  const useVenueSplit = isVenue && venueSplit;
  const venueLeftCount = useVenueSplit ? Math.ceil(displayTeams.length / 2) : displayTeams.length;
  const leftTeams = isVenue ? displayTeams.slice(0, venueLeftCount) : displayTeams;
  const rightTeams = useVenueSplit ? displayTeams.slice(venueLeftCount) : [];
  const rightStartRank = venueLeftCount + 1;

  useLayoutEffect(() => {
    if (!isVenue || displayTeams.length === 0) {
      setVenueSplit(false);
      return;
    }

    const teamsChanged = teamsKeyRef.current !== teamsKey;
    if (teamsChanged) {
      teamsKeyRef.current = teamsKey;
      if (venueSplit) {
        setVenueSplit(false);
        return;
      }
    }

    if (venueSplit) return;

    const measureOverflow = () => {
      const area = listAreaRef.current;
      const content = contentRef.current;
      if (!area || !content) return;
      if (content.scrollHeight > area.clientHeight + 2) {
        setVenueSplit(true);
      }
    };

    measureOverflow();

    const area = listAreaRef.current;
    if (!area) return;

    const ro = new ResizeObserver(measureOverflow);
    ro.observe(area);
    if (contentRef.current) ro.observe(contentRef.current);

    return () => ro.disconnect();
  }, [isVenue, teamsKey, displayTeams.length, venueSplit]);

  useEffect(() => {
    if (!isVenue) return;
    const onResize = () => {
      teamsKeyRef.current = '';
      setVenueSplit(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isVenue]);

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
            isVenue ? 'mb-4 gap-6' : 'mb-3 gap-3 sm:mb-4 sm:gap-5 md:gap-6',
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
            'flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border border-white/15 bg-[rgba(8,4,28,0.72)] shadow-[0_0_32px_rgba(80,40,180,0.35)] backdrop-blur-sm',
            cfg.panel,
            cfg.panelPad,
          )}
        >
          {!isVenue ? (
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
                  <div ref={contentRef} className="grid grid-cols-2 items-start gap-8">
                    <LeaderboardColumn
                      teams={leftTeams}
                      size={size}
                      highlightTeamId={highlightTeamId}
                      isPlayer={isPlayer}
                      cfg={cfg}
                      startRank={1}
                      eliminationStyle={eliminationStyle}
                    />
                    <LeaderboardColumn
                      teams={rightTeams}
                      size={size}
                      highlightTeamId={highlightTeamId}
                      isPlayer={isPlayer}
                      cfg={cfg}
                      startRank={rightStartRank}
                      eliminationStyle={eliminationStyle}
                    />
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
