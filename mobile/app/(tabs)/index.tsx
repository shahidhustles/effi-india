import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import {
  COMPLAINT_CATEGORIES,
  type ComplaintCategoryId,
} from "../../constants/config";
import { useConnection } from "../../hooks/useConnection";

export default function HomeScreen() {
  const router = useRouter();
  const { connect, state } = useConnection();
  const [selectedCategory, setSelectedCategory] =
    useState<ComplaintCategoryId>("SANITATION");

  const isFetching = state === "fetching";

  async function handleStartCall() {
    const details = await connect(selectedCategory, "en");
    if (!details) {
      Alert.alert(
        "Connection Failed",
        "Could not reach the Effi server. Make sure the agent is running and AGENT_API_URL is correct.",
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header Section */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatarPlaceholder}>
              <MaterialCommunityIcons name="account" size={32} color="#185079" />
            </View>
            <View>
              <Text style={styles.headerGreeting}>Good Morning,</Text>
              <Text style={styles.headerName}>Citizen</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions (Our Call Options) */}
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
                activeOpacity={0.7}
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
                    color={isSelected ? "#FFFFFF" : "#185079"}
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

        {/* Start Button */}
        <TouchableOpacity
          style={[styles.callBtn, isFetching && styles.callBtnDisabled]}
          onPress={handleStartCall}
          disabled={isFetching}
          activeOpacity={0.8}
        >
          {isFetching ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.callBtnText}>Start Interaction</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Recent Complaints Section */}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Complaints</Text>
        </View>
        <View style={styles.serviceCategoriesContainer}>
           <View style={styles.emptyState}>
             <Text style={styles.emptyStateText}>No recent complaints found</Text>
           </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 100, // Leave space for bottom nav
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
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#bbd6e1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerGreeting: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 2,
  },
  headerName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#185079",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E293B",
  },
  quickActionsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  quickActionCard: {
    width: "31%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  quickActionCardSelected: {
    borderColor: "#4e97bb",
    backgroundColor: "#ffffff",
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  iconBoxUnselected: {
    backgroundColor: "#bbd6e1", // our palette light blue
  },
  iconBoxSelected: {
    backgroundColor: "#4e97bb", // our palette main blue
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
  },
  quickActionTextSelected: {
    color: "#185079",
  },
  callBtn: {
    backgroundColor: "#185079",
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    marginBottom: 32,
    shadowColor: "#185079",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  callBtnDisabled: {
    backgroundColor: "#95bfd1",
    shadowOpacity: 0,
    elevation: 0,
  },
  callBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 8,
  },
  serviceCategoriesContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    padding: 20,
  },
  emptyStateText: {
    color: "#94A3B8",
    fontSize: 14,
  }
});
