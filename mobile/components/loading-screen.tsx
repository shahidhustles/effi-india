import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../constants/theme";

export function LoadingScreen({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={COLORS.primary} size="small" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  label: {
    color: COLORS.muted,
    fontSize: 15,
    fontWeight: "600",
  },
});
