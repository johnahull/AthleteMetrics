import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import {
  type UnitSystem,
  convertVelocity,
  convertMass,
  convertForceRel,
  velocityUnit,
  massUnit,
  forceRelUnit,
  powerRelUnit,
} from '@/lib/sprint-fv-units';

const STORAGE_KEY = 'sprint-fv-unit-system';

function readStoredSystem(): UnitSystem {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'metric' || stored === 'imperial') return stored;
  } catch { /* SSR / private browsing */ }
  return 'metric';
}

interface UnitSystemContextValue {
  system: UnitSystem;
  setSystem: (s: UnitSystem) => void;
  vel: (ms: number) => number;
  mass: (kg: number) => number;
  forceRel: (nPerKg: number) => number;
  velUnit: string;
  massUnit: string;
  forceRelUnit: string;
  powerRelUnit: string;
}

const Ctx = createContext<UnitSystemContextValue | null>(null);

export function UnitSystemProvider({ children }: { children: ReactNode }) {
  const [system, setSystemState] = useState<UnitSystem>(readStoredSystem);

  const setSystem = useCallback((s: UnitSystem) => {
    setSystemState(s);
    try { localStorage.setItem(STORAGE_KEY, s); } catch { /* ignore */ }
  }, []);

  const value = useMemo<UnitSystemContextValue>(() => ({
    system,
    setSystem,
    vel: (ms: number) => convertVelocity(ms, system),
    mass: (kg: number) => convertMass(kg, system),
    forceRel: (nPerKg: number) => convertForceRel(nPerKg, system),
    velUnit: velocityUnit(system),
    massUnit: massUnit(system),
    forceRelUnit: forceRelUnit(system),
    powerRelUnit: powerRelUnit(system),
  }), [system, setSystem]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnitSystem(): UnitSystemContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUnitSystem must be used within UnitSystemProvider');
  return ctx;
}
