'use client';

/** Previous venue wager-collection UI — kept for reference / rollback. */
export function VenueWagerCollectionScreenLegacy({
  roundIndex,
  category,
  wagerLockedCount,
  wagerLockedTotal,
  liveTotalTeams,
}: {
  roundIndex: number;
  category?: string | null;
  wagerLockedCount: number;
  wagerLockedTotal: number;
  liveTotalTeams: number;
}) {
  return (
    <div className="flex h-full w-full animate-fadeIn items-center justify-center px-6">
      <div className="flex max-w-[900px] flex-col items-center justify-center gap-8 text-center">
        <div className="inline-flex items-center gap-3 rounded-full border border-[#ffc400]/55 bg-[linear-gradient(180deg,rgba(60,30,100,0.95)_0%,rgba(20,10,50,0.95)_100%)] px-10 py-4 shadow-[0_0_28px_rgba(255,196,0,0.25)]">
          <span className="text-lg font-semibold uppercase tracking-[0.22em] text-[#ffc400]">
            Round {roundIndex + 1} — Wager Round
          </span>
        </div>
        {category ? (
          <div className="inline-flex items-center gap-3 rounded-full border border-[#00d9ff]/45 bg-[rgba(0,217,255,0.08)] px-7 py-2.5 shadow-[0_0_22px_rgba(0,217,255,0.2)]">
            <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#9de9ff]/85 sm:text-base">
              Category
            </span>
            <span className="text-lg font-black uppercase tracking-[0.18em] text-[#00d9ff] sm:text-xl">
              {category}
            </span>
          </div>
        ) : null}
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border-2 border-[#ffc400]/50 bg-[rgba(255,196,0,0.08)] shadow-[0_0_36px_rgba(255,196,0,0.3)]">
          <svg
            className="h-14 w-14 animate-pulse text-[#ffc400]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
            <path d="M12 18V6" />
          </svg>
        </div>
        <h1 className="text-[52px] font-black leading-none text-white drop-shadow-[0_0_18px_rgba(255,196,0,0.4)]">
          Players Are Locking
          <br />
          Wager Points
        </h1>
        <p className="text-2xl font-medium text-[#ffc400]/75">
          Please place your wagers on your devices now...
        </p>
        <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-[#1de8ff]/60 bg-[#11154f]/80 px-6 py-3 shadow-[0_0_18px_rgba(29,232,255,0.25)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#1de8ff]/70 bg-[#0c0f3a]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-[#1de8ff]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="3" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#1de8ff]/80">
              Wagered
            </p>
            <p className="text-3xl font-black leading-none text-white">
              {wagerLockedCount}{' '}
              <span className="text-xl text-white/60">/ {wagerLockedTotal || liveTotalTeams}</span>
            </p>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ffc400]" />
          <div
            className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ffc400]"
            style={{ animationDelay: '0.3s' }}
          />
          <div
            className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ffc400]"
            style={{ animationDelay: '0.6s' }}
          />
        </div>
      </div>
    </div>
  );
}
