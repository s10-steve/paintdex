"use client";

/**
 * App-wide auth context. Everything runs client-side against Supabase — there
 * is no server session.
 *
 * Sign-in uses **Google Identity Services** (the `gsi/client` library) to get an
 * ID token directly in the browser, then exchanges it with Supabase via
 * `signInWithIdToken`. This authenticates from our own origin, so Google's
 * consent screen shows `paintdex.app` rather than the Supabase callback domain
 * — and it needs no paid Supabase custom domain. `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
 * is required for sign-in to appear.
 *
 * When Supabase itself isn't configured the provider is inert: `configured` is
 * false and the UI hides all account features, so the site works exactly as it
 * did before accounts existed.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface AuthContextValue {
  /** True when Supabase env vars are present and accounts are available. */
  configured: boolean;
  /** True when a Google client id is set (so the sign-in button can appear). */
  googleEnabled: boolean;
  /** True once the Google Identity Services library is loaded and initialised. */
  gisReady: boolean;
  session: Session | null;
  user: User | null;
  /** True until the initial session check resolves. */
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Generate a random nonce and its SHA-256 hash (hex) for the ID-token flow. */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = crypto.randomUUID() + crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { raw, hashed };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [gisReady, setGisReady] = useState(false);
  const nonceRef = useRef<string | null>(null);
  const initedRef = useRef(false);

  // Track the Supabase session.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load Google Identity Services and initialise the ID-token flow (once).
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !GOOGLE_CLIENT_ID) return;

    async function init() {
      if (initedRef.current || !window.google) return;
      initedRef.current = true;
      const { raw, hashed } = await makeNonce();
      nonceRef.current = raw;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID!,
        nonce: hashed,
        callback: async ({ credential }) => {
          const { error } = await supabase!.auth.signInWithIdToken({
            provider: "google",
            token: credential,
            nonce: nonceRef.current ?? undefined,
          });
          if (error) console.error("Google sign-in failed:", error.message);
        },
      });
      setGisReady(true);
    }

    if (window.google?.accounts?.id) {
      void init();
      return;
    }

    let script = document.getElementById("google-gsi") as HTMLScriptElement | null;
    const onLoad = () => void init();
    if (!script) {
      script = document.createElement("script");
      script.id = "google-gsi";
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", onLoad);
    return () => script?.removeEventListener("load", onLoad);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      googleEnabled: Boolean(GOOGLE_CLIENT_ID),
      gisReady,
      session,
      user: session?.user ?? null,
      loading,
      async signOut() {
        window.google?.accounts.id.disableAutoSelect();
        const supabase = getSupabase();
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [session, loading, gisReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth context. Returns an inert value when no provider is present. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  return {
    configured: false,
    googleEnabled: false,
    gisReady: false,
    session: null,
    user: null,
    loading: false,
    async signOut() {},
  };
}
