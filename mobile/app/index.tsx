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
import { DEPARTMENTS, type DepartmentId } from "../constants/config";
import { useConnection } from "../hooks/useConnection";

export default function HomeScreen() {
  const router = useRouter();
  const { connect, state } = useConnection();

  const [selectedDept, setSelectedDept] = useState<DepartmentId>("MUNICIPAL");

  const isFetching = state === "fetching";

  async function handleStartCall() {
    const details = await connect(selectedDept, "en");
    if (!details) {
      Alert.alert(
        "Connection Failed",
        "Could not reach the Effi server. Make sure the agent is running and AGENT_API_URL is correct.",
        [{ text: "OK" }]
      );
      return;
    }
    router.push({
      pathname: "/call",
      params: {
        token: details.token,
        serverUrl: details.serverUrl,
        roomName: details.roomName,
        department: details.department,
        language: details.language,
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerGreeting}>Hello,</Text>
        <Text style={styles.headerTitle}>Effi India</Text>
        <Text style={styles.headerSubtitle}>
          Make your day easy with our AI-powered citizen services assistant.
        </Text>
      </View>

      {/* Department cards */}
      <Text style={styles.sectionLabel}>Select Department</Text>
      {DEPARTMENTS.map((dept) => {
        const isSelected = selectedDept === dept.id;
        return (
          <TouchableOpacity
            key={dept.id}
            style={[
              styles.card,
              isSelected && { borderColor: dept.color, borderWidth: 1.5 },
            ]}
            onPress={() => setSelectedDept(dept.id)}
            activeOpacity={0.7}
          >
            <View style={[styles.cardIcon, { backgroundColor: dept.color + "15" }]}>
              <MaterialCommunityIcons
                name={dept.iconName}
                size={28}
                color={dept.color}
              />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{dept.label}</Text>
              <Text style={styles.cardDesc}>{dept.description}</Text>
            </View>
            {isSelected && (
              <View style={[styles.checkBadge, { backgroundColor: dept.color }]}>
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {/* Call button */}
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
            <Ionicons name="mic-outline" size={24} color="#FFFFFF" />
            <Text style={styles.callBtnText}>Start Interaction</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>
        🇮🇳 Made in India
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: "#F8FAFC",
    minHeight: "100%",
  },

  // Header
  header: {
    marginBottom: 32,
  },
  headerGreeting: {
    fontSize: 28,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  headerTitle: {
    color: "#3B82F6",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  headerSubtitle: {
    color: "#64748B",
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 24,
  },

  // Section
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 16,
    paddingLeft: 4,
  },

  // Cards
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  cardIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1E293B",
  },
  cardDesc: {
    fontSize: 13,
    color: "#94A3B8",
    marginTop: 4,
    lineHeight: 18,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },

  // Call button
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    borderRadius: 24,
    paddingVertical: 20,
    gap: 12,
    marginTop: 24,
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 8,
  },
  callBtnDisabled: {
    backgroundColor: "#93C5FD",
    shadowOpacity: 0,
    elevation: 0,
  },
  callBtnText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },

  // Footer
  footer: {
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 40,
    letterSpacing: 0.5,
  },
});
