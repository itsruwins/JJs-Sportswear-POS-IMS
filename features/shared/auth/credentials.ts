// Username-based accounts on top of Supabase Auth.
// The schema (supabase/migrations) signs users up with a placeholder email derived
// from the username; email confirmation must be off in Supabase Auth. Usernames are
// unique regardless of case, so the derived email is always lowercased.

export const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,30}$/;
export const USERNAME_HINT = "3–30 characters: letters, numbers, dots, or underscores.";
export const PASSWORD_MIN = 8;

// The domain keeps the shop's old name on purpose: every account's login address in Supabase Auth is stored
// with it, so changing it here alone would lock everyone out. People never see it.
export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@jjsportswear.local`;
}

type AuthErrorLike = { code?: string; message?: string; status?: number } | null | undefined;

export type AuthFailure = { field: "username" | "password" | "form"; message: string };

export function describeSignUpError(error: AuthErrorLike): AuthFailure {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "user_already_exists" || message.includes("already registered")) {
    return { field: "username", message: "That username is taken. Try another, or log in instead." };
  }
  if (message.includes("database error saving new user")) {
    // The profile trigger rejects case-insensitive duplicates and invalid usernames.
    return { field: "username", message: "That username can’t be used. It may already be taken, so try another." };
  }
  if (code === "weak_password" || message.includes("password")) {
    return { field: "password", message: error?.message ?? "Choose a stronger password." };
  }
  return networkOrGeneric(error);
}

export function describeLogInError(error: AuthErrorLike): AuthFailure {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return { field: "form", message: "That username and password don’t match. Check both and try again." };
  }
  return networkOrGeneric(error);
}

function networkOrGeneric(error: AuthErrorLike): AuthFailure {
  const message = (error?.message ?? "").toLowerCase();
  if (!error?.status || message.includes("fetch") || message.includes("network")) {
    return { field: "form", message: "We couldn’t reach the shop’s server. Check your connection and try again." };
  }
  return { field: "form", message: "Something went wrong on our side. Please try again in a moment." };
}
