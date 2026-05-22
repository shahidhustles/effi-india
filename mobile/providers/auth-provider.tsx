import { AppState, type AppStateStatus } from "react-native";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import {
  createSessionFromUrl,
  fetchProfile,
  getSupabaseClient,
  signInWithGoogle,
  signOut,
  type Profile,
} from "../lib/supabase";

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function createFallbackProfile(user: User): Profile {
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    full_name:
      metadata.full_name ?? metadata.name ?? user.email?.split("@")[0] ?? "Citizen",
    avatar_url: metadata.avatar_url ?? null,
    created_at: null,
    updated_at: null,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const hydrateProfile = useCallback(
    async (nextUser: User | null) => {
      if (!nextUser) {
        setProfile(null);
        return;
      }

      try {
        const fetchedProfile = await fetchProfile(nextUser.id);
        setProfile(fetchedProfile ?? createFallbackProfile(nextUser));
      } catch (error) {
        console.warn("[auth] Failed to hydrate profile:", error);
        setProfile(createFallbackProfile(nextUser));
      }
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    await hydrateProfile(user);
  }, [hydrateProfile, user]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          try {
            await createSessionFromUrl(initialUrl);
          } catch (error) {
            console.warn("[auth] Failed to restore session from initial URL:", error);
          }
        }

        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        setIsLoading(false);
        void hydrateProfile(initialSession?.user ?? null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (isMounted) {
        setIsLoading(false);
      }
      void hydrateProfile(nextSession?.user ?? null);
    });

    const linkSubscription = Linking.addEventListener("url", ({ url }) => {
      void createSessionFromUrl(url);
    });

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextState === "active"
        ) {
          void supabase.auth.startAutoRefresh();
        }

        if (nextState.match(/inactive|background/)) {
          void supabase.auth.stopAutoRefresh();
        }

        appStateRef.current = nextState;
      },
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linkSubscription.remove();
      appStateSubscription.remove();
    };
  }, [hydrateProfile, supabase.auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      isLoading,
      isAuthenticated: Boolean(session?.user),
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [isLoading, profile, refreshProfile, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
