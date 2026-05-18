"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { LoaderCircle, Play, Radar, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDemoData, isDemoMode, simulateRealtimeEvents, type DemoData } from "@/lib/demo";

type DemoContextValue = {
  data: DemoData;
  isRunning: boolean;
  startSimulation: () => void;
  resetSimulation: () => void;
  pushTick: () => void;
  updateData: (updater: (current: DemoData) => DemoData) => void;
};

const STORAGE_KEY = "gc-demo-state-v1";
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DemoData>(() => getDemoData());
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDemoMode()) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as DemoData;
        setData(parsed);
        setIsRunning(parsed.simulation.running);
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!isDemoMode()) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...data,
        simulation: {
          ...data.simulation,
          running: isRunning
        }
      })
    );
  }, [data, isRunning]);

  useEffect(() => {
    if (!isRunning || !isDemoMode()) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      setData((current) => simulateRealtimeEvents(current));
    }, 4500);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  const value = useMemo<DemoContextValue>(
    () => ({
      data,
      isRunning,
      startSimulation() {
        setIsRunning(true);
        setData((current) =>
          current.simulation.tick === 0 ? simulateRealtimeEvents(current) : current
        );
      },
      resetSimulation() {
        setIsRunning(false);
        setData(getDemoData());
        window.localStorage.removeItem(STORAGE_KEY);
      },
      pushTick() {
        setData((current) => simulateRealtimeEvents(current));
      },
      updateData(updater) {
        setData((current) => updater(current));
      }
    }),
    [data, isRunning]
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemoState() {
  const context = useContext(DemoContext);

  if (!context) {
    throw new Error("useDemoState must be used within DemoProvider.");
  }

  return context;
}

export function DemoModeControl() {
  const { data, isRunning, startSimulation, resetSimulation, pushTick } = useDemoState();

  if (!isDemoMode()) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
        <Radar className="h-3.5 w-3.5" />
        Modo Demonstracao
      </span>
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200">
        {isRunning ? (
          <>
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Operacao ao vivo
          </>
        ) : (
          <>Pronta para apresentar</>
        )}
      </span>
      <Button type="button" className="gap-2" onClick={startSimulation} disabled={isRunning}>
        <Play className="h-4 w-4" />
        Iniciar simulacao
      </Button>
      <Button type="button" variant="secondary" className="gap-2" onClick={pushTick}>
        <LoaderCircle className="h-4 w-4" />
        Novo evento
      </Button>
      <Button type="button" variant="ghost" className="gap-2" onClick={resetSimulation}>
        <RotateCcw className="h-4 w-4" />
        Resetar
      </Button>
      <span className="text-xs text-slate-400">Tick {data.simulation.tick}</span>
    </div>
  );
}
