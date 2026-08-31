import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type Investor } from "./api";

interface Ctx {
  investors: Investor[];
  current: Investor | null;
  setCurrentId: (id: string) => void;
  refresh: () => Promise<void>;
  /** Fire a behavioural event for the active investor. No-ops if none. */
  track: (
    eventType: string,
    startupId?: string,
    value?: Record<string, unknown>,
  ) => void;
}

const InvestorContext = createContext<Ctx>({
  investors: [],
  current: null,
  setCurrentId: () => {},
  refresh: async () => {},
  track: () => {},
});

const STORAGE_KEY = "viq.investor";

export function InvestorProvider({ children }: { children: ReactNode }) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [currentId, setCurrentIdState] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  const refresh = useCallback(async () => {
    try {
      const list = await api.investors();
      setInvestors(list);
      setCurrentIdState((prev) => {
        if (prev && list.some((i) => i.investor_id === prev)) return prev;
        return list[0]?.investor_id ?? null;
      });
    } catch {
      setInvestors([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setCurrentId = useCallback((id: string) => {
    setCurrentIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const current = useMemo(
    () => investors.find((i) => i.investor_id === currentId) ?? investors[0] ?? null,
    [investors, currentId],
  );

  const track = useCallback(
    (eventType: string, startupId?: string, value?: Record<string, unknown>) => {
      if (!current) return;
      void api.track({
        investor_id: current.investor_id,
        startup_id: startupId,
        event_type: eventType,
        event_value: value,
      });
    },
    [current],
  );

  return (
    <InvestorContext.Provider value={{ investors, current, setCurrentId, refresh, track }}>
      {children}
    </InvestorContext.Provider>
  );
}

export function useInvestor() {
  return useContext(InvestorContext);
}
