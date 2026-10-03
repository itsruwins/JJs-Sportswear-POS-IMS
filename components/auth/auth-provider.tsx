"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AuthDialog, type AuthMode } from "./auth-dialog";

type AuthContextValue = {
  /** Open the account sheet. Signed-in visitors see their account instead of a form. */
  openAuth: (mode: AuthMode, username?: string) => void;
  username: string | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

type SheetState = { open: boolean; mode: AuthMode; prefill: string; nonce: number };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>({ open: false, mode: "signup", prefill: "", nonce: 0 });

  useEffect(() => {
    const supabase = createClient();
    const read = (meta: Record<string, unknown> | undefined) =>
      typeof meta?.username === "string" ? meta.username : null;

    supabase.auth.getSession().then(({ data }) => setUsername(read(data.session?.user.user_metadata)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUsername(read(session?.user.user_metadata));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const openAuth = useCallback((mode: AuthMode, prefill = "") => {
    setSheet((s) => ({ open: true, mode, prefill, nonce: s.nonce + 1 }));
  }, []);

  const signOut = useCallback(async () => {
    await createClient().auth.signOut();
    setUsername(null);
  }, []);

  const value = useMemo(() => ({ openAuth, username, signOut }), [openAuth, username, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthDialog
        open={sheet.open}
        mode={sheet.mode}
        prefill={sheet.prefill}
        nonce={sheet.nonce}
        username={username}
        onSignedIn={setUsername}
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
