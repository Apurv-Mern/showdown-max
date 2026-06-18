'use client';

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
    rankBox: string;
    rankNum: string;
    medalInRank: string;
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
    scoreText: 'text-xs sm:text-sm',
    rankBox: 'h-8 w-8 sm:h-9 sm:w-9',
    rankNum: 'text-xs sm:text-sm',
    medalInRank: 'h-4 w-4 sm:h-5 sm:w-5',
  },
  venue: {
    wrapper: 'p-4 sm:p-6 md:p-8',
    title: 'text-[clamp(2.25rem,4.5vh,3.75rem)]',
    medal: 'h-10 w-10 sm:h-12 sm:w-12 md:h-14 md:w-14',
    panel: 'w-full max-w-[min(92vw,56rem)]',
    panelPad: 'px-4 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6',
    colHeader: 'text-xs sm:text-sm md:text-base',
    rowGap: 'gap-2 sm:gap-2.5 md:gap-3',
    rowPy: 'py-2.5 sm:py-3 md:py-3.5',
    rowPx: 'px-3 sm:px-4 md:px-5',
    nameText: 'text-base sm:text-lg md:text-xl',
    scoreText: 'text-sm sm:text-base md:text-lg',
    rankBox: 'h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11',
    rankNum: 'text-sm sm:text-base',
    medalInRank: 'h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7',
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
    scoreText: 'text-xs sm:text-sm',
    rankBox: 'h-8 w-8',
    rankNum: 'text-xs',
    medalInRank: 'h-4 w-4',
  },
};

function LeaderboardRankBadge({ rank, size }: { rank: number; size: LeaderboardScreenSize }) {
  const cfg = SIZE_CONFIG[size];
  const rankIndex = rank - 1;

  if (rankIndex === 0) {
    return (
      <div
        className={cn('relative flex shrink-0 items-center justify-center', cfg.rankBox)}
        aria-hidden
      >
        <div className="absolute inset-0 rotate-45 rounded-sm border border-[#ffd86a]/80 bg-[linear-gradient(135deg,#8a5a00_0%,#ffd35e_45%,#ffb300_100%)] shadow-[0_0_12px_rgba(255,200,60,0.45)]" />
        <img
          src="/leaderboardIcon.png"
          alt=""
          className={cn('relative z-10 object-contain drop-shadow-md', cfg.medalInRank)}
        />
      </div>
    );
  }

  if (rankIndex === 1) {
    return (
      <div
        className={cn('relative flex shrink-0 items-center justify-center', cfg.rankBox)}
        aria-hidden
      >
        <div className="absolute inset-0 rotate-45 rounded-sm border border-[#c8d8f5]/80 bg-[linear-gradient(135deg,#4a5f82_0%,#b8c9e8_50%,#8fa4c8_100%)] shadow-[0_0_10px_rgba(180,200,240,0.35)]" />
        <img
          src="/leaderboardIcon.png"
          alt=""
          className={cn(
            'relative z-10 object-contain drop-shadow-md brightness-125 saturate-0',
            cfg.medalInRank,
          )}
        />
      </div>
    );
  }

  if (rankIndex === 2) {
    return (
      <div
        className={cn('relative flex shrink-0 items-center justify-center', cfg.rankBox)}
        aria-hidden
      >
        <div className="absolute inset-0 rotate-45 rounded-sm border border-[#f0a060]/80 bg-[linear-gradient(135deg,#6b3a12_0%,#df8f49_50%,#b85c1e_100%)] shadow-[0_0_10px_rgba(220,130,50,0.35)]" />
        <img
          src="/leaderboardIcon.png"
          alt=""
          className={cn(
            'relative z-10 object-contain drop-shadow-md sepia hue-rotate-[330deg] saturate-[1.8]',
            cfg.medalInRank,
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border border-[#2a1f6a]/80 bg-[#120a38]/90 font-black text-white shadow-inner',
        cfg.rankBox,
        cfg.rankNum,
      )}
    >
      {rank}
    </div>
  );
}

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

      <div className="relative z-10 flex w-full flex-col items-center">
        <div className="mb-3 flex items-center justify-center gap-3 sm:mb-4 sm:gap-5 md:gap-6">
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
            'rounded-2xl border border-white/15 bg-[rgba(8,4,28,0.72)] shadow-[0_0_32px_rgba(80,40,180,0.35)] backdrop-blur-sm',
            cfg.panel,
            cfg.panelPad,
          )}
        >
          <div
            className={cn(
              'mb-2 grid grid-cols-[minmax(3rem,0.9fr)_minmax(0,2.4fr)_minmax(4.5rem,1fr)] items-center font-bold uppercase tracking-[0.12em] text-white/90 sm:mb-3',
              cfg.colHeader,
            )}
          >
            <div className="text-center">Rank</div>
            <div className="text-center">Team Name</div>
            <div className="text-right">Score</div>
          </div>

          {teams.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/45">{emptyMessage}</p>
          ) : (
            <div className={cn('flex flex-col', cfg.rowGap)}>
              {teams.map((team, idx) => {
                const isMe = isPlayer && highlightTeamId != null && team.teamId === highlightTeamId;
                const score = Number(team.score ?? 0);

                return (
                  <div
                    key={team.teamId}
                    className={cn(
                      'relative grid grid-cols-[minmax(3rem,0.9fr)_minmax(0,2.4fr)_minmax(4.5rem,1fr)] items-center rounded-xl border border-[#5b2fd4]/35 bg-[linear-gradient(90deg,#5a0096_0%,#2a0068_55%,#120040_100%)] shadow-[0_4px_18px_rgba(90,0,150,0.25)]',
                      cfg.rowPy,
                      cfg.rowPx,
                      team.isEliminated && 'opacity-55',
                      isMe &&
                        'z-10 scale-[1.02] border-[#35f6ff]/80 ring-2 ring-[#35f6ff] ring-offset-1 ring-offset-[#0b0524] shadow-[0_0_28px_rgba(53,246,255,0.55)] animate-pulse-me',
                    )}
                  >
                    {isMe ? (
                      <span className="pointer-events-none absolute -top-2 right-2 rounded-full border border-[#35f6ff] bg-[#0b0524] px-2 py-[1px] text-[9px] font-black uppercase tracking-[0.16em] text-[#8af7ff] shadow-[0_0_10px_rgba(53,246,255,0.6)] sm:text-[10px]">
                        You
                      </span>
                    ) : null}

                    <div className="flex justify-center">
                      <LeaderboardRankBadge rank={idx + 1} size={size} />
                    </div>

                    <div
                      className={cn(
                        'min-w-0 truncate text-center font-bold uppercase text-white',
                        cfg.nameText,
                        isMe && 'text-[#bff8ff] drop-shadow-[0_0_8px_rgba(53,246,255,0.75)]',
                        team.isEliminated && 'line-through',
                      )}
                    >
                      {toDisplayUpper(team.teamName)}
                    </div>

                    <div
                      className={cn(
                        'text-right font-extrabold uppercase tracking-wide text-[#00f0ff]',
                        cfg.scoreText,
                        isMe && 'drop-shadow-[0_0_8px_rgba(53,246,255,0.75)]',
                      )}
                    >
                      {score} Points
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
