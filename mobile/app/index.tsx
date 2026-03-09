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
        <View style={styles.headerAccent} />
        <Text style={styles.headerTitle}>Effi India</Text>
        <Text style={styles.headerSubtitle}>
          AI-powered citizen services assistant
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
                <Ionicons name="checkmark" size={16} color="#0B0F1A" />
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
          <ActivityIndicator color="#0B0F1A" />
        ) : (
          <>
            <Ionicons name="call" size={22} color="#0B0F1A" />
            <Text style={styles.callBtnText}>Start Call</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.footer}>
        Powered by LiveKit  ·  Deepgram  ·  GPT-4o  ·  Cartesia
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 48,
    backgroundColor: "#0B0F1A",
    minHeight: "100%",
  },

  // Header
  header: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 24,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "#1E293B",
    overflow: "hidden",
  },
  headerAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: "#06B6D4",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerTitle: {
    color: "#F0FDFA",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  headerSubtitle: {
    color: "#67E8F9",
    fontSize: 14,
    fontWeight: "500",
    opacity: 0.8,
  },

  // Section
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4B5563",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 12,
    marginTop: 4,
  },

  // Cards
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#E5E7EB",
  },
  cardDesc: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 3,
  },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  // Call button
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06B6D4",
    borderRadius: 16,
    paddingVertical: 18,
    gap: 10,
    marginTop: 20,
    shadowColor: "#06B6D4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  callBtnDisabled: {
    backgroundColor: "#164E63",
    shadowOpacity: 0,
  },
  callBtnText: {
    color: "#0B0F1A",
    fontSize: 18,
    fontWeight: "800",
  },

  // Footer
  footer: {
    textAlign: "center",
    color: "#374151",
    fontSize: 11,
    marginTop: 28,
    letterSpacing: 0.3,
  },
});
