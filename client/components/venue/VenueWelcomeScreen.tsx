'use client';

import type { RefObject } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { VenueLogo } from '@/components/venue/VenueLogo';

type VenueWelcomeScreenProps = {
  sessionPin: string;
  joinUrl: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  showVideo: boolean;
  onVideoPlay: () => void;
  onVideoError: () => void;
};

export function VenueWelcomeScreen({
  sessionPin,
  joinUrl,
  videoRef,
  showVideo,
  onVideoPlay,
  onVideoError,
}: VenueWelcomeScreenProps) {
  return (
    <div className="relative h-full w-full overflow-hidden animate-fadeIn">
      <div className="absolute left-[40px] top-[50px] z-10 text-white">
        <p className="text-[40px] font-bold uppercase leading-[90px]">SESSION PIN</p>
        <p className="-mt-6 text-[80px] font-extrabold leading-[90px] text-[#00D9FF]">{sessionPin}</p>
      </div>

      <div className="absolute left-[670px] top-[20px] z-10">
        <VenueLogo width={500} />
      </div>

      <div
        className="absolute left-[365px] top-[306px] h-[550px] w-[950px] overflow-hidden rounded-[30px] border-4 border-[#00D9FF] bg-black"
      >
        {showVideo ? (
          <video
            ref={videoRef}
            src="/Promo Video.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="h-full w-full object-cover"
            onPlay={onVideoPlay}
            onError={onVideoError}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <VenueLogo width={420} />
          </div>
        )}
      </div>

      <div
        className="absolute right-[44px] top-[248px] flex h-[665px] w-[521px] flex-col items-center rounded-[30px] border-4 border-[#00D9FF] px-6 pt-8"
        style={{ background: 'rgba(6, 0, 39, 0.8)' }}
      >
        <div className="flex size-[369px] items-center justify-center rounded-[8px] bg-white p-3">
          <QRCodeSVG value={joinUrl} size={340} className="h-full w-full" />
        </div>
        <p className="mt-6 text-center text-[40px] font-extrabold uppercase leading-[40px] text-[#00D9FF]">
          SCAN TO JOIN
        </p>
        <p className="mt-1 text-center text-[30px] font-semibold uppercase leading-[40px] text-white">
          OR GO TO
        </p>
        <p className="text-center text-[30px] font-bold leading-[40px] text-[#00D9FF]">
          maxshowdownlive.com
        </p>
        <p className="text-center text-[30px] font-bold uppercase leading-[40px] text-white">
          AND ENTER THE PIN
        </p>
      </div>

      <p className="absolute bottom-[50px] left-1/2 w-full -translate-x-1/2 text-center text-[50px] font-black uppercase leading-[60px] text-white">
        ENTER YOU TEAM NAME
        <br />
        AND JOIN THE GAME
      </p>
    </div>
  );
}
