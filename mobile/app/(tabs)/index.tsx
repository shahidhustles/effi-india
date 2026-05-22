import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Avatar } from "../../components/avatar";
import { ComplaintCard } from "../../components/complaint-card";
import { EmptyState } from "../../components/empty-state";
import { COLORS, SHADOW } from "../../constants/theme";
import {
  COMPLAINT_CATEGORIES,
  type ComplaintCategoryId,
} from "../../constants/config";
import { useAuth } from "../../hooks/useAuth";
import { useConnection } from "../../hooks/useConnection";
import {
  fetchRecentComplaints,
  getUserFirstName,
  type ComplaintListItem,
} from "../../lib/supabase";

export default function HomeScreen() {
  const router = useRouter();
  const { connect, state } = useConnection();
  const { profile, user } = useAuth();
  const [selectedCategory, setSelectedCategory] =
    useState<ComplaintCategoryId>("SANITATION");
  const [recentComplaints, setRecentComplaints] = useState<ComplaintListItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  const isFetching = state === "fetching";

  const loadRecentComplaints = useCallback(async () => {
    try {
      setIsLoadingRecent(true);
      const complaints = await fetchRecentComplaints(5);
      setRecentComplaints(complaints);
    } catch (error) {
      console.warn("[home] Failed to fetch recent complaints:", error);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecentComplaints();
    }, [loadRecentComplaints]),
  );

  const onRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await loadRecentComplaints();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadRecentComplaints]);

  async function handleStartCall() {
    const details = await connect(selectedCategory, "en");
    if (!details) {
      Alert.alert(
        "Connection Failed",
        "Could not reach the Effi server. Make sure the token server is deployed and your session is active.",
        [{ text: "OK" }],
      );
      return;
    }

    router.push({
      pathname: "/call",
      params: {
        token: details.token,
        serverUrl: details.serverUrl,
        roomName: details.roomName,
        category: details.category,
        language: details.language,
      },
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Avatar
              size={48}
              name={profile?.full_name ?? user?.email ?? "Citizen"}
              url={profile?.avatar_url}
            />
            <View style={styles.headerTextBlock}>
              <Text style={styles.headerGreeting}>Good Morning,</Text>
              <Text style={styles.headerName}>
                {getUserFirstName(user, profile)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>

        <View style={styles.quickActionsContainer}>
          {COMPLAINT_CATEGORIES.map((entry) => {
            const isSelected = selectedCategory === entry.id;
            return (
              <TouchableOpacity
                key={entry.id}
                style={[
                  styles.quickActionCard,
                  isSelected && styles.quickActionCardSelected,
                ]}
                onPress={() => setSelectedCategory(entry.id)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.iconBox,
                    isSelected ? styles.iconBoxSelected : styles.iconBoxUnselected,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={entry.iconName}
                    size={28}
                    color={isSelected ? "#FFFFFF" : COLORS.primary}
                  />
                </View>
                <Text
                  style={[
                    styles.quickActionText,
                    isSelected && styles.quickActionTextSelected,
                  ]}
                  numberOfLines={2}
                >
                  {entry.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.callBtn, isFetching && styles.callBtnDisabled]}
          onPress={handleStartCall}
          disabled={isFetching}
          activeOpacity={0.85}
        >
          {isFetching ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.callBtnText}>Start Interaction</Text>
          )}
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Complaints</Text>
        </View>

        <View style={styles.recentContainer}>
          {isLoadingRecent ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : recentComplaints.length === 0 ? (
            <EmptyState
              title="No recent complaints"
              message="Your recent requests will appear here after you register a complaint."
            />
          ) : (
            recentComplaints.map((complaint) => (
              <ComplaintCard key={complaint.id} item={complaint} />
            ))
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTextBlock: {
    marginLeft: 12,
  },
  headerGreeting: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 2,
  },
  headerName: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.primary,
  },
  sectionHeader: {
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
  },
  quickActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  quickActionCard: {
    width: "31%",
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "transparent",
    ...SHADOW,
  },
  quickActionCardSelected: {
    borderColor: COLORS.primarySoft,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  iconBoxUnselected: {
    backgroundColor: COLORS.primaryTint,
  },
  iconBoxSelected: {
    backgroundColor: COLORS.primarySoft,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
  },
  quickActionTextSelected: {
    color: COLORS.primary,
  },
  callBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 17,
    marginBottom: 28,
    ...SHADOW,
  },
  callBtnDisabled: {
    backgroundColor: COLORS.primarySoft,
  },
  callBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  recentContainer: {
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
