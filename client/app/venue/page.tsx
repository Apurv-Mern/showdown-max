'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PUBLIC_API_URL } from '@/lib/env';

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
      return 'Could not activate venue for that session PIN. Please try again.';
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
    fetch(`${API_URL}/api/public/sessions/pin/${sessionPin}`)
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
        setPinError('This session PIN is not valid or session is no longer active.');
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
    <div className="w-full h-full flex items-center justify-center p-6 relative overflow-hidden">
      <div className="w-full max-w-xl rounded-3xl border border-neon-cyan/35 bg-[#060d22]/85 p-8 shadow-[0_0_40px_rgba(0,229,255,0.18)] backdrop-blur-sm">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black tracking-tight text-neon-cyan text-glow-cyan mb-2">
            VENUE LOGIN
          </h1>
          <p className="text-foreground/70 text-lg">
            Enter the 6-digit session PIN to activate this venue screen.
          </p>
        </div>

        {errorText ? (
          <div className="mb-5 rounded-xl border border-neon-red/45 bg-neon-red/10 px-4 py-3 text-sm text-neon-red">
            {errorText}
          </div>
        ) : null}
        {pinError ? (
          <div className="mb-5 rounded-xl border border-neon-red/45 bg-neon-red/10 px-4 py-3 text-sm text-neon-red">
            {pinError}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="text"
            value={pin}
            onChange={(e) => {
              setPinError('');
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
            }}
            placeholder="Session PIN"
            maxLength={6}
            className="w-full rounded-2xl border border-neon-cyan/35 bg-[#040a1c]/90 px-6 py-4 text-center text-4xl font-mono font-black tracking-[0.30em] text-neon-cyan outline-none focus:border-neon-cyan focus:shadow-[0_0_20px_rgba(0,229,255,0.25)]"
          />
          <button
            type="submit"
            disabled={pin.length !== 6 || isCheckingPin}
            className="w-full rounded-2xl border border-neon-cyan/40 bg-neon-cyan/20 px-5 py-4 text-lg font-bold text-neon-cyan transition-colors hover:bg-neon-cyan/28 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isCheckingPin ? 'Checking PIN...' : 'Activate Venue'}
          </button>
        </form>

        {savedPin ? (
          <button
            type="button"
            onClick={() => activateVenueAsync(savedPin)}
            disabled={isCheckingPin}
            className="mt-4 w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-foreground/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reconnect last session ({savedPin})
          </button>
        ) : null}
      </div>
    </div>
  );
}
