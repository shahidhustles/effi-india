import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";
import { AuthProvider } from "../providers/auth-provider";
import { useAuth } from "../hooks/useAuth";
import { LoadingScreen } from "../components/loading-screen";

registerGlobals();

function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();

  if (isLoading) {
    return <LoadingScreen label="Checking your session..." />;
  }

  const inLogin = segments[0] === "login";

  if (!isAuthenticated && !inLogin) {
    return <Redirect href="/login" />;
  }

  if (isAuthenticated && inLogin) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#F8FAFC" },
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{ title: "Home", headerShown: false }}
      />
      <Stack.Screen
        name="call"
        options={{
          title: "Voice Chat",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}
