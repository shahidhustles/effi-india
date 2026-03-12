import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";

// Register LiveKit globals once at app startup
registerGlobals();

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F8FAFC" },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: "Home" }}
        />
        <Stack.Screen
          name="call"
          options={{
            title: "Voice Chat",
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}
