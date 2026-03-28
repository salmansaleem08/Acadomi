"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";

import {
  apiMe,
  getToken,
  setToken,
  type UserDTO,
} from "@/lib/api";

type AuthState = {
  user: UserDTO | null;
  loading: boolean;
  ready: boolean;
};

const AuthContext = React.createContext<
  AuthState & {
    signIn: (token: string, user: UserDTO) => void;
    signOut: () => void;
    refresh: () => Promise<void>;
  }
>({
  user: null,
  loading: true,
  ready: false,
  signIn: () => {},
  signOut: () => {},
  refresh: async () => {},
});

const protectedPrefixes = [
  "/dashboard",
  "/settings",
  "/upload",
  "/podcast",
  "/role-reversal",
  "/tutor",
  "/cheat-sheets",
  "/bookmarks",
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<UserDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [ready, setReady] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const refresh = React.useCallback(async () => {
    const t = getToken();
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const { user: u } = await apiMe(t);
      setUser(u);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) {
        setLoading(false);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  React.useEffect(() => {
    if (!ready || loading) return;
    const needAuth = protectedPrefixes.some((p) => pathname.startsWith(p));
    if (needAuth && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [ready, loading, user, pathname, router]);

  const signIn = React.useCallback((token: string, u: UserDTO) => {
    setToken(token);
    setUser(u);
  }, []);

  const signOut = React.useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/");
  }, [router]);

  const value = React.useMemo(
    () => ({
      user,
      loading,
      ready,
      signIn,
      signOut,
      refresh,
    }),
    [user, loading, ready, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}
