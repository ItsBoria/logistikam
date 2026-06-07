import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

// Read the cached session synchronously so components never start with a
// false null — eliminates the null→session flicker after sign-in/sign-out.
function getInitialSession(): { session: Session | null; loading: boolean } {
  // supabase stores the session in localStorage; _currentSession is the
  // in-memory cache set immediately on client init — no async needed.
  const raw = (supabase.auth as any)._currentSession;
  if (raw !== undefined) return { session: raw ?? null, loading: false };
  return { session: null, loading: true };
}

export function useSupabaseSession() {
  const initial = getInitialSession();
  const [session, setSession] = useState<Session | null>(initial.session);
  const [loading, setLoading] = useState(initial.loading);

  useEffect(() => {
    let mounted = true;
    // Always re-verify from network in case the cached value is stale
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session);
        setLoading(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
