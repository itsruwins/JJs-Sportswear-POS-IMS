"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Signs out and returns to the landing page, the same way the admin does. */
export function useLogOut() {
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const logOut = async () => {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  };
  return { signingOut, logOut };
}

export function LogOutButton({ className = "" }: { className?: string }) {
  const { signingOut, logOut } = useLogOut();
  return (
    <button
      type="button"
      onClick={logOut}
      disabled={signingOut}
      className={`press inline-flex h-11 items-center gap-2 rounded-full px-5 text-[0.9375rem] font-semibold text-ink shadow-[inset_0_0_0_1px_var(--line)] hover:bg-ground-2 disabled:opacity-70 ${className}`}
    >
      <LogOut aria-hidden="true" className="size-[1.125rem] text-ink-2" />
      {signingOut ? "Logging out…" : "Log out"}
    </button>
  );
}
