import { useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { Avatar } from "../components/avatar";
import { COLORS, SHADOW } from "../constants/theme";
import { useAuth } from "../hooks/useAuth";
import { showOAuthSetupHint } from "../lib/supabase";

export default function LoginScreen() {
  const { isAuthenticated, signInWithGoogle } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  const handleGoogleSignIn = async () => {
    try {
      setIsSubmitting(true);
      await signInWithGoogle();
    } catch (error) {
      showOAuthSetupHint(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Avatar size={72} name="Effi" />
        <Text style={styles.title}>Effi India</Text>
        <Text style={styles.subtitle}>
          Sign in with Google to track your complaints, see nearby reports, and
          continue your interactions across devices.
        </Text>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={() => {
            void handleGoogleSignIn();
          }}
          activeOpacity={0.85}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons
                name="google"
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.buttonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.footnote}>
          Your sign-in is used only to link complaints to your account and show
          your requests.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "center",
    ...SHADOW,
  },
  title: {
    marginTop: 18,
    fontSize: 26,
    fontWeight: "700",
    color: COLORS.primary,
  },
  subtitle: {
    marginTop: 10,
    color: COLORS.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  button: {
    marginTop: 24,
    minHeight: 52,
    width: "100%",
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  buttonDisabled: {
    backgroundColor: COLORS.primarySoft,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  footnote: {
    marginTop: 16,
    color: COLORS.inactive,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
});
