import { Image, Text, View, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS } from "../constants/theme";

function getInitials(name: string | null | undefined): string {
  if (!name) {
    return "";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function Avatar({
  name,
  url,
  size = 48,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
}) {
  const radius = size / 2;
  const initials = getInitials(name);

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
        },
      ]}
    >
      {initials ? (
        <Text style={[styles.initials, { fontSize: Math.max(14, size / 2.8) }]}>
          {initials}
        </Text>
      ) : (
        <MaterialCommunityIcons
          name="account"
          size={Math.max(20, size / 1.8)}
          color={COLORS.primary}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: COLORS.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: COLORS.primary,
    fontWeight: "700",
  },
});
