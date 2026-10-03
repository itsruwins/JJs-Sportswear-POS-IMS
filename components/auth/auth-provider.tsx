"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthDialog, type AuthMode } from "./auth-dialog";

type AuthContextValue = {
  /** Open the account sheet. Signed-in visitors see their account instead of a form. */
  openAuth: (mode: AuthMode, username?: string) => void;
  username: string | null;
  /** True for staff and the owner, who have an admin to go to. */
  isStaff: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

type SheetState = { open: boolean; mode: AuthMode; prefill: string; nonce: number };

const ADMIN_PATH = "/admin";

async function fetchIsStaff(userId: string) {
  const { data } = await createClient().from("profiles").select("role").eq("id", userId).single<{ role: string }>();
  return data?.role === "staff" || data?.role === "owner";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isStaff, setIsStaff] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ open: false, mode: "signup", prefill: "", nonce: 0 });
  // Where to send staff after logging in, when the admin sent them here to log in.
  const nextPath = useRef<string | null>(null);

  const openAuth = useCallback((mode: AuthMode, prefill = "") => {
    setSheet((s) => ({ open: true, mode, prefill, nonce: s.nonce + 1 }));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const read = (meta: Record<string, unknown> | undefined) =>
      typeof meta?.username === "string" ? meta.username : null;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsername(read(session?.user.user_metadata));
      const userId = session?.user.id;
      // Supabase calls made inside this callback can deadlock the client; defer them.
      setTimeout(() => {
        if (userId) fetchIsStaff(userId).then(setIsStaff);
        else setIsStaff(false);
      }, 0);
    });

    // /admin sends visitors without a session here with ?auth=login&next=/admin.
    let openTimer: number | undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "login") {
      const next = params.get("next");
      nextPath.current = next?.startsWith(ADMIN_PATH) ? next : null;
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      openTimer = window.setTimeout(() => openAuth("login"), 0);
    }

    return () => {
      window.clearTimeout(openTimer);
      data.subscription.unsubscribe();
    };
  }, [openAuth]);

  const handleSignedIn = useCallback(async (name: string, userId: string) => {
    setUsername(name);
    const staff = await fetchIsStaff(userId);
    setIsStaff(staff);
    if (staff) window.location.assign(nextPath.current ?? ADMIN_PATH);
  }, []);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
    setUsername(null);
    setIsStaff(false);
  }, []);

  const value = useMemo(() => ({ openAuth, username, isStaff, signOut }), [openAuth, username, isStaff, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog
        open={sheet.open}
        mode={sheet.mode}
        prefill={sheet.prefill}
        nonce={sheet.nonce}
        username={username}
        isStaff={isStaff}
        onSignedIn={handleSignedIn}
        onSignOut={signOut}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </AuthContext.Provider>
  );
}

/** A button that opens the account sheet; usable from server components. */
export function AuthButton({
  mode,
  className,
  children,
}: {
  mode: AuthMode;
  className?: string;
  children: React.ReactNode;
}) {
  const { openAuth } = useAuth();
  return (
    <button type="button" onClick={() => openAuth(mode)} className={className} aria-haspopup="dialog">
      {children}
    </button>
  );
}
