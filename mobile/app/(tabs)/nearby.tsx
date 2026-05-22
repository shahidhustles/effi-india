import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { ComplaintCard } from "../../components/complaint-card";
import { EmptyState } from "../../components/empty-state";
import { COLORS } from "../../constants/theme";
import {
  fetchNearbyComplaints,
  type NearbyComplaint,
} from "../../lib/supabase";

type PermissionState = "unknown" | "granted" | "denied";

export default function NearbyScreen() {
  const [items, setItems] = useState<NearbyComplaint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [permissionState, setPermissionState] =
    useState<PermissionState>("unknown");

  const loadNearby = useCallback(async () => {
    try {
      setIsLoading(true);

      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      if (permission.status !== "granted") {
        setPermissionState("denied");
        setItems([]);
        return;
      }

      setPermissionState("granted");

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nearby = await fetchNearbyComplaints(
        currentLocation.coords.latitude,
        currentLocation.coords.longitude,
        2000,
      );
      setItems(nearby);
    } catch (error) {
      console.warn("[nearby] Failed to fetch nearby complaints:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadNearby();
    }, [loadNearby]),
  );

  const onRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await loadNearby();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadNearby]);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={styles.title}>Nearby</Text>
        <Text style={styles.subtitle}>
          Complaints from other citizens within 2 km of your current location.
        </Text>

        <View style={styles.list}>
          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : permissionState === "denied" ? (
            <View style={styles.permissionCard}>
              <EmptyState
                title="Location is needed"
                message="Allow location access to see complaints around you. Exact coordinates are not shown in this feed."
              />
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  void loadNearby();
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : items.length === 0 ? (
            <EmptyState
              title="No nearby complaints"
              message="There are no public complaints from other users within 2 km right now."
            />
          ) : (
            items.map((item) => (
              <ComplaintCard key={item.id} item={item} variant="nearby" />
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
  permissionCard: {
    gap: 12,
  },
  retryButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
