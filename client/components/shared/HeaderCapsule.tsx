import { cn } from '@/lib/utils';

export function HeaderCapsule({
  icon,
  value,
  className,
}: {
  icon: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex h-10 min-w-[6.5rem] items-center rounded-full border border-[#ff2b68] bg-[linear-gradient(180deg,#FF0000_0%,#801669_100%)] pl-9 pr-3 shadow-[0_4px_10px_rgba(0,0,0,0.3)] sm:h-11 sm:min-w-27.5 sm:pl-10 sm:pr-4',
        className,
      )}
    >
      <div className="absolute -left-2.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center sm:-left-3 sm:h-14 sm:w-14">
        <img src={icon} alt="" className="h-full w-full object-contain drop-shadow-md" />
      </div>
      <span className="w-full text-center text-base font-black leading-none text-white sm:text-lg md:text-xl">
        {value}
      </span>
    </div>
  );
}
