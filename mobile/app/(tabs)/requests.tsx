import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { ComplaintCard } from "../../components/complaint-card";
import { EmptyState } from "../../components/empty-state";
import { COLORS } from "../../constants/theme";
import {
  fetchAllComplaints,
  type ComplaintListItem,
} from "../../lib/supabase";

export default function RequestsScreen() {
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadComplaints = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchAllComplaints();
      setComplaints(data);
    } catch (error) {
      console.warn("[requests] Failed to fetch complaints:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadComplaints();
    }, [loadComplaints]),
  );

  const onRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await loadComplaints();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadComplaints]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.title}>Your Requests</Text>
        <Text style={styles.subtitle}>
          Every complaint raised from your account appears here in reverse
          chronological order.
        </Text>

        <View style={styles.list}>
          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : complaints.length === 0 ? (
            <EmptyState
              title="No complaints yet"
              message="Once you register a complaint, it will appear here with its ticket number and current status."
            />
          ) : (
            complaints.map((item) => <ComplaintCard key={item.id} item={item} />)
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 100,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
    color: COLORS.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: 14,
  },
  loadingState: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
