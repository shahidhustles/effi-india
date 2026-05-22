import { StyleSheet, Text, View } from "react-native";
import { COLORS, SHADOW } from "../constants/theme";

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 20,
    ...SHADOW,
  },
  title: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  message: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
});
