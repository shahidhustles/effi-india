import { StyleSheet, Text, View } from "react-native";
import { COLORS, SHADOW } from "../constants/theme";
import type { ComplaintListItem, NearbyComplaint } from "../lib/supabase";

type ComplaintCardLike = ComplaintListItem | NearbyComplaint;

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function formatDistance(distanceMeters?: number) {
  if (typeof distanceMeters !== "number") {
    return null;
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

function getStatusColors(status: string) {
  switch (status) {
    case "resolved":
      return {
        backgroundColor: COLORS.successSurface,
        color: COLORS.successText,
      };
    case "in_progress":
      return {
        backgroundColor: COLORS.warningSurface,
        color: COLORS.warningText,
      };
    default:
      return {
        backgroundColor: "#EAF2F7",
        color: COLORS.primary,
      };
  }
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function ComplaintCard({
  item,
  variant = "default",
}: {
  item: ComplaintCardLike;
  variant?: "default" | "nearby";
}) {
  const statusStyle = getStatusColors(item.status);
  const distance = "distanceMeters" in item ? formatDistance(item.distanceMeters) : null;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.ticket}>{item.ticketNumber}</Text>
        <View style={[styles.statusPill, { backgroundColor: statusStyle.backgroundColor }]}>
          <Text style={[styles.statusText, { color: statusStyle.color }]}>
            {formatStatus(item.status)}
          </Text>
        </View>
      </View>
      <Text style={styles.category}>{item.category.replace(/_/g, " ")}</Text>
      <Text style={styles.summary}>{item.summary}</Text>
      <View style={styles.footerRow}>
        <Text style={styles.metaText}>{formatRelativeDate(item.createdAt)}</Text>
        {variant === "nearby" && distance ? (
          <Text style={styles.metaText}>{distance}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    ...SHADOW,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  ticket: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  category: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  summary: {
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  metaText: {
    color: COLORS.inactive,
    fontSize: 12,
    fontWeight: "600",
  },
});
