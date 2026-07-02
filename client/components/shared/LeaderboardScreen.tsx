'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  venue: {
    wrapper: 'p-4 sm:p-6 md:p-8',
    title: 'text-[clamp(2.25rem,4.5vh,3.75rem)]',
    medal: 'h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14',
    panel: 'w-full max-w-[min(98vw,88rem)]',
    panelPad: 'px-4 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6',
    colHeader: 'text-sm sm:text-base md:text-lg',
    rowGap: 'gap-2.5 sm:gap-3 md:gap-4',
    rowPy: 'py-3.5 sm:py-4 md:py-5',
    rowPx: 'px-4 sm:px-5 md:px-6',
    nameText:
      'text-2xl font-normal leading-none sm:text-3xl md:text-4xl min-[1920px]:text-5xl drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]',
    scoreText:
      'text-2xl font-normal leading-none sm:text-3xl md:text-4xl min-[1920px]:text-5xl drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]',
    rankText:
      'text-2xl font-normal leading-none sm:text-3xl md:text-4xl min-[1920px]:text-5xl drop-shadow-[0_0_10px_rgba(255,255,255,0.35)]',
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
}: {
  teams: LeaderboardTeam[];
  size: LeaderboardScreenSize;
  highlightTeamId: number | null;
  isPlayer: boolean;
  cfg: (typeof SIZE_CONFIG)[LeaderboardScreenSize];
  startRank?: number;
}) {
  const isVenue = size === 'venue';

  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', cfg.rowGap)}>
      {teams.map((team, idx) => {
        const isMe = isPlayer && highlightTeamId != null && team.teamId === highlightTeamId;
        const score = Number(team.score ?? 0);
        const rank = startRank + idx;

        return (
          <div
            key={team.teamId}
            className={cn(
              'relative items-center rounded-xl border border-white/20 bg-white/5',
              isVenue
                ? 'grid grid-cols-[minmax(4.5rem,auto)_1fr_minmax(6rem,auto)]'
                : 'grid grid-cols-[1fr_auto]',
              cfg.rowPy,
              cfg.rowPx,
              team.isEliminated && 'opacity-55',
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
                className={cn(
                  'text-center tabular-nums text-white',
                  cfg.rankText ?? cfg.scoreText,
                )}
              >
                {rank}
              </div>
            ) : null}

            <div
              className={cn(
                'min-w-0 truncate uppercase text-white',
                isVenue ? 'text-center font-normal' : 'font-bold',
                cfg.nameText,
                team.isEliminated && 'line-through',
              )}
            >
              {toDisplayUpper(team.teamName)}
            </div>

            <div
              className={cn(
                'text-right text-white',
                isVenue ? 'font-normal' : 'font-extrabold',
                cfg.scoreText,
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

export interface LeaderboardScreenProps {
  teams: LeaderboardTeam[];
  size?: LeaderboardScreenSize;
  highlightTeamId?: number | null;
  className?: string;
  /** Full game-show scene (spotlights, floor). Off for host modal shell. */
  showScene?: boolean;
  emptyMessage?: string;
  titleId?: string;
}

export function LeaderboardScreen({
  teams,
  size = 'player',
  highlightTeamId = null,
  className,
  showScene = true,
  emptyMessage = 'No teams on the leaderboard yet',
  titleId,
}: LeaderboardScreenProps) {
  const cfg = SIZE_CONFIG[size];
  const isPlayer = size === 'player';
  const isVenue = size === 'venue';
  const [venueSplit, setVenueSplit] = useState(false);
  const listAreaRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const teamsKeyRef = useRef('');
  const teamsKey = teams.map((t) => `${t.teamId}:${t.score}`).join('|');

  const useVenueSplit = isVenue && venueSplit;
  const venueLeftCount = useVenueSplit ? Math.ceil(teams.length / 2) : teams.length;
  const leftTeams = isVenue ? teams.slice(0, venueLeftCount) : teams;
  const rightTeams = useVenueSplit ? teams.slice(venueLeftCount) : [];
  const rightStartRank = venueLeftCount + 1;

  useLayoutEffect(() => {
    if (!isVenue || teams.length === 0) {
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
  }, [isVenue, teamsKey, teams.length, venueSplit]);

  useEffect(() => {
    if (!isVenue) return;
    const onResize = () => {
      teamsKeyRef.current = '';
      setVenueSplit(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isVenue]);

  return (
    <div
      className={cn(
        'relative flex h-full min-h-0 w-full flex-col items-center justify-center overflow-hidden',
        cfg.wrapper,
        className,
      )}
    >
      {isVenue ? (
        <>
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/venue-stage-bg.png')" }}
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden />
        </>
      ) : null}

      <LeaderboardScene showScene={showScene} size={size} />

      <div className="relative z-10 flex h-full min-h-0 w-full max-h-full flex-col items-center">
        <div className="mb-3 flex shrink-0 items-center justify-center gap-3 sm:mb-4 sm:gap-5 md:gap-6">
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

          {teams.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/45">{emptyMessage}</p>
          ) : (
            <div ref={listAreaRef} className="min-h-0 flex-1 overflow-hidden">
              <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]">
                {useVenueSplit ? (
                  <div
                    ref={contentRef}
                    className="grid grid-cols-2 items-start gap-6 lg:gap-8"
                  >
                    <LeaderboardColumn
                      teams={leftTeams}
                      size={size}
                      highlightTeamId={highlightTeamId}
                      isPlayer={isPlayer}
                      cfg={cfg}
                      startRank={1}
                    />
                    <LeaderboardColumn
                      teams={rightTeams}
                      size={size}
                      highlightTeamId={highlightTeamId}
                      isPlayer={isPlayer}
                      cfg={cfg}
                      startRank={rightStartRank}
                    />
                  </div>
                ) : (
                  <div ref={contentRef}>
                    <LeaderboardColumn
                      teams={teams}
                      size={size}
                      highlightTeamId={highlightTeamId}
                      isPlayer={isPlayer}
                      cfg={cfg}
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
