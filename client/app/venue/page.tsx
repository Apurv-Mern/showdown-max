'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PUBLIC_API_URL } from '@/lib/env';
import Image from 'next/image';

const VENUE_PIN_STORAGE_KEY = 'venue_display_pin';
const API_URL = PUBLIC_API_URL;

export default function VenueSessionLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState('');
  const [savedPin, setSavedPin] = useState('');
  const [isCheckingPin, setIsCheckingPin] = useState(false);
  const [pinError, setPinError] = useState('');

  const errorText = useMemo(() => {
    if (searchParams.get('error') === 'invalid-pin') {
      return 'Incorrect PIN or session unavailable. Check the code, or confirm a host is assigned to this session.';
    }
    return '';
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(VENUE_PIN_STORAGE_KEY) || '';
    if (/^\d{6}$/.test(stored)) {
      setSavedPin(stored);
    }
  }, []);

  const activateVenue = (sessionPin: string) => {
    if (!/^\d{6}$/.test(sessionPin)) return;
    setPinError('');
    setIsCheckingPin(true);
    fetch(`${API_URL}/api/public/sessions/pin/${sessionPin}?for=venue`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Invalid session PIN');
        }
        const data = await res.json();
        if (!data?.success) {
          throw new Error('Invalid session PIN');
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(VENUE_PIN_STORAGE_KEY, sessionPin);
        }
        router.push(`/venue/display?pin=${sessionPin}&intro=1`);
      })
      .catch(() => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(VENUE_PIN_STORAGE_KEY);
        }
        setPinError(
          'Incorrect PIN. This code may not exist, the show may have ended, or no host is assigned to this session yet.',
        );
      })
      .finally(() => {
        setIsCheckingPin(false);
      });
  };

  const activateVenueAsync = (sessionPin: string) => {
    if (!/^\d{6}$/.test(sessionPin)) {
      setPinError('Please enter a valid 6-digit session PIN.');
      return;
    }
    activateVenue(sessionPin);
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    activateVenueAsync(pin);
  };

  return (
    <div className="font-sans flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-transparent px-4 antialiased sm:px-8">
      <div className="m-12 flex w-full flex-col items-center justify-center gap-12 lg:flex-row lg:gap-24">
        <div className="shrink-0 flex items-center justify-center">
          <Image
            src="/logo.png"
            className="h-auto object-contain sm:w-125 lg:w-200"
            alt="Max Showdown LIVE Logo"
            width={800}
            height={600}
            priority
          />
        </div>

        <main className="z-10 flex w-full max-w-180 flex-col items-center justify-center">
          <div className="flex w-full flex-col items-center">
            <h1 className="text-center text-[clamp(1.5rem,4vw,2.25rem)] font-bold text-white">
              VENUE LOGIN
            </h1>
            <p className="mt-2 text-center text-[clamp(0.875rem,2.2vw,1.125rem)] font-medium text-[#00d1ff]">
              ENTER THE 6-DIGIT SESSION PIN TO ACTIVATE THIS VENUE SCREEN
            </p>

            <form
              onSubmit={onSubmit}
              className="mt-8 w-full rounded-2xl bg-[rgba(26,31,46,0.92)] px-7 py-8 sm:px-9 sm:py-10"
            >
              {errorText ? (
                <div
                  className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                  role="alert"
                >
                  {errorText}
                </div>
              ) : null}
              {pinError ? (
                <div
                  className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                  role="alert"
                >
                  {pinError}
                </div>
              ) : null}

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label htmlFor="venue-pin" className="text-sm font-bold text-white">
                    ENTER SESSION PIN
                  </label>
                  <input
                    id="venue-pin"
                    type="text"
                    value={pin}
                    onChange={(e) => {
                      setPinError('');
                      setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                    }}
                    placeholder="Enter 6-digit PIN"
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                    className="h-12 w-full rounded-lg border border-white/10 bg-[#050508] px-3.5 text-center font-mono text-sm tracking-[0.25em] text-white outline-none transition-[border-color,box-shadow] duration-200 placeholder:tracking-normal placeholder:text-[#a1a1a1] focus:border-[rgba(0,209,255,0.5)] focus:shadow-[0_0_0_2px_rgba(0,209,255,0.15)]"
                  />
                </div>
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={pin.length !== 6 || isCheckingPin}
                  className="h-11 min-w-[200px] max-w-[85%] rounded-lg bg-[linear-gradient(180deg,#dc2626_0%,#7f1d1d_100%)] px-10 text-base font-bold text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-50 sm:min-w-[240px]"
                >
                  {isCheckingPin ? 'CHECKING PIN...' : 'ACTIVATE VENUE'}
                </button>
              </div>

              {savedPin ? (
                <button
                  type="button"
                  onClick={() => activateVenueAsync(savedPin)}
                  disabled={isCheckingPin}
                  className="mt-4 w-full rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  RECONNECT LAST SESSION ({savedPin})
                </button>
              ) : null}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
