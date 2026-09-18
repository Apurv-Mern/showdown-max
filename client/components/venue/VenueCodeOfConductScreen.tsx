'use client';

const RULES = [
  {
    number: 1,
    text: 'NO CHEATING ALLOWED DURNING GAMESHOW',
    accent: '#0085FF',
    numberFrom: '#0085FF',
    numberTo: '#002BB5',
  },
  {
    number: 2,
    text: 'NOT NECCESSARY ANYWAY, PLAYERS ARE SMART ENOUGH',
    accent: '#FF6F00',
    numberFrom: '#FF6F00',
    numberTo: '#994200',
  },
  {
    number: 3,
    text: 'HOST IS ALWAYS RIGHT, EVEN IF HE/SHE NEVER STARTS ON TIME',
    accent: '#38FF00',
    numberFrom: '#38FF00',
    numberTo: '#007B00',
  },
  {
    number: 4,
    text: 'BRIBES ALLOWED (CASH AND MAJOR CREDIT CARDS ACCEPTED)',
    accent: '#FFCC00',
    numberFrom: '#FFCC00',
    numberTo: '#FFA600',
  },
] as const;

export function VenueCodeOfConductScreen() {
  return (
    <section
      className="absolute inset-0 z-20 animate-fadeIn overflow-hidden"
      aria-labelledby="venue-code-of-conduct-title"
    >
      <img
        src="/venue-splash.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        draggable={false}
      />

      <div className="relative z-10 flex h-full w-full flex-col items-center px-[6%] py-[3%]">
        <h1 id="venue-code-of-conduct-title" className="sr-only">
          Code of Conduct
        </h1>
        <img
          src="/coc.png"
          alt=""
          className="h-auto w-[min(68vw,1180px)] shrink-0 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]"
          draggable={false}
        />

        <ol className="mt-[3.2vh] flex w-full max-w-[min(52vw,980px)] flex-col gap-[2.4vh]">
          {RULES.map((rule) => (
            <li
              key={rule.number}
              className="relative isolate flex h-[min(9.2vh,100px)] w-full items-center overflow-hidden rounded-full"
              style={{
                background: 'linear-gradient(180deg, #00072F 0%, #00010A 100%)',
                border: `3px solid ${rule.accent}`,
                boxShadow: `0 0 14px ${rule.accent}`,
              }}
            >
              <div
                className="absolute inset-y-0 left-0 w-[102px] rounded-l-full"
                style={{
                  background: `linear-gradient(180deg, ${rule.numberFrom} 0%, ${rule.numberTo} 100%)`,
                }}
              />
              <div className="relative z-10 ml-[16px] flex size-[70px] shrink-0 items-center justify-center rounded-full bg-[#000027] shadow-[0_0_8px_#00D0FF]">
                <span className="text-[40px] font-extrabold leading-none text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
                  {rule.number}
                </span>
              </div>
              <p className="relative z-10 ml-6 mr-6 min-w-0 flex-1 text-[clamp(1.05rem,1.55vw,1.875rem)] font-extrabold uppercase leading-tight text-white [text-shadow:0_2px_4px_rgba(0,0,0,0.5)]">
                {rule.text}
              </p>
            </li>
          ))}
        </ol>

        <img
          src="/logo.png"
          alt="Max Showdown Live"
          className="mt-auto h-auto w-[min(32vw,607px)] shrink-0 object-contain drop-shadow-[0_8px_28px_rgba(0,0,0,0.55)]"
          draggable={false}
        />
      </div>
    </section>
  );
}
