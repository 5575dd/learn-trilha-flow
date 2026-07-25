import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import { clearTransientUserStorage } from "@/data/localStorage";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }
    const sb = getSupabase();
    sb.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session ?? null);
      })
      .finally(() => setLoading(false));
    const { data } = sb.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });
    const unsub = () => data.subscription.unsubscribe();
    return unsub;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    const currentUserId = session?.user.id;
    await getSupabase().auth.signOut();
    if (typeof window !== "undefined" && currentUserId) {
      clearTransientUserStorage(currentUserId);
      Object.keys(window.sessionStorage)
        .filter((k) => k.startsWith("trilha."))
        .forEach((k) => window.sessionStorage.removeItem(k));
    }
    setSession(null);
  }, [session?.user.id]);

  const value = useMemo(
    () => ({ session, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return v;
}
