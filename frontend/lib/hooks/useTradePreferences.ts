"use client";

import { useState, useCallback, useEffect } from "react";
import type { TradePreferences } from "@/lib/utils/position-sizing";

const STORAGE_KEY = "trade_preferences";

const DEFAULT_PREFS: TradePreferences = {
  capital: 10000,
  leverage: 1,
  riskPct: 0.02,
  agreedDisclaimer: false,
  updatedAt: "",
};

function readFromStorage(): TradePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TradePreferences;
    if (!parsed.agreedDisclaimer) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useTradePreferences() {
  const [preferences, setPreferences] = useState<TradePreferences | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setPreferences(readFromStorage());
    setLoaded(true);
  }, []);

  const savePreferences = useCallback((prefs: TradePreferences) => {
    const updated = { ...prefs, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setPreferences(updated);
  }, []);

  const clearPreferences = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setPreferences(null);
  }, []);

  return {
    preferences,
    loaded,
    defaults: DEFAULT_PREFS,
    savePreferences,
    clearPreferences,
    needsSetup: loaded && preferences === null,
  };
}
