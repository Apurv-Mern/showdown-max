'use client';

import { cn, toDisplayUpper } from '@/lib/utils';

type VenueLobbyTeam = {
  teamName: string;
};

type VenueLobbyScreenProps = {
  teams: VenueLobbyTeam[];
  maxTeams: number;
};

export function VenueLobbyScreen({ teams, maxTeams }: VenueLobbyScreenProps) {
  const slots = Math.max(1, maxTeams);

  return (
    <div className="flex h-full w-full flex-col items-center overflow-hidden px-[150px] pt-[80px] animate-fadeIn">
      <h2 className="text-center text-[70px] font-black uppercase leading-[70px] text-white">
        TEAM REGISTRATION
      </h2>
      <p className="mt-2 text-center text-[30px] font-bold uppercase leading-[36px] text-white">
        {teams.length} OF {slots} TEAMS JOINED
      </p>

      <div className="mt-[40px] grid w-[1620px] grid-cols-5 content-start gap-[30px] overflow-y-auto pb-8 pl-1 pr-3 pt-5">
        {Array.from({ length: slots }).map((_, i) => {
          const team = teams[i];
          return (
            <div key={i} className="relative h-[100px] w-[300px]">
              <div
                className={cn(
                  'flex h-full w-full items-center rounded-[16px] px-6',
                  team ? 'border-2 border-[#00D9FF]' : 'border-2 border-dashed border-white',
                )}
                style={{
                  background: 'linear-gradient(180deg, #0010AA 0%, #00010A 100%)',
                  boxShadow: team
                    ? '0 0 18px rgba(0, 217, 255, 0.55)'
                    : '0 6px 5px rgba(0,0,0,0.7)',
                }}
              >
                {team ? (
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-12 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: 'radial-gradient(circle at 50% 50%, #38FF00 0%, #135600 100%)',
                        boxShadow: '0 4px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      <svg viewBox="0 0 24 24" className="size-7 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 12.5 9.5 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[20px] font-bold uppercase leading-[28px] text-white">
                        {toDisplayUpper(team.teamName)}
                      </p>
                      <p className="text-[14px] font-bold leading-[20px] text-white">Ready</p>
                    </div>
                  </div>
                ) : (
                  <p className="w-full text-center text-[20px] font-bold text-white/80">Waiting...</p>
                )}
              </div>
              <div className="absolute -right-1 -top-3 flex size-10 items-center justify-center rounded-full border-2 border-[#00D9FF] bg-[#040040] text-[18px] font-bold text-white">
                {i + 1}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
