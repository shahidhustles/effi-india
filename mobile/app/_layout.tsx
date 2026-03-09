import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { registerGlobals } from "@livekit/react-native";

// Register LiveKit globals once at app startup
registerGlobals();

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0B0F1A" },
          headerTintColor: "#E0F2FE",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#0B0F1A" },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: "Effi India" }}
        />
        <Stack.Screen
          name="call"
          options={{
            title: "Call",
            headerBackTitle: "End",
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}
