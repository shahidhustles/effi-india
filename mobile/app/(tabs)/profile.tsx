import { useMemo } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Avatar } from "../../components/avatar";
import { COLORS, SHADOW } from "../../constants/theme";
import { useAuth } from "../../hooks/useAuth";
import { getUserDisplayName } from "../../lib/supabase";

export default function ProfileScreen() {
  const { profile, signOut, user } = useAuth();

  const displayName = useMemo(
    () => getUserDisplayName(user, profile),
    [profile, user],
  );

  const handleSignOut = () => {
    Alert.alert("Sign Out?", "You will need to sign in again to access your requests.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.profileCard}>
          <Avatar size={84} name={displayName} url={profile?.avatar_url} />
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{user?.email ?? "No email available"}</Text>
        </View>

        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.85}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  title: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 20,
  },
  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: "center",
    ...SHADOW,
  },
  name: {
    marginTop: 16,
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: "700",
  },
  email: {
    marginTop: 8,
    color: COLORS.muted,
    fontSize: 14,
  },
  signOutButton: {
    marginTop: 16,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  signOutText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
