import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  LiveKitRoom,
  useVoiceAssistant,
  useLocalParticipant,
  BarVisualizer,
  useConnectionState,
  AudioSession,
  AndroidAudioTypePresets,
  type AgentState,
} from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import type { DepartmentId } from "../constants/config";
import { DEPARTMENTS } from "../constants/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallParams {
  token: string;
  serverUrl: string;
  roomName: string;
  department: DepartmentId;
  language: string;
}

// ─── Inner component (needs LiveKitRoom context) ───────────────────────────────

function CallUI({ department }: { department: DepartmentId }) {
  const router = useRouter();
  const { state: agentState, audioTrack } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const dept = DEPARTMENTS.find((d) => d.id === department) ?? DEPARTMENTS[0];

  // Explicitly enable mic once connected.
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    if (!localParticipant) return;
    localParticipant.setMicrophoneEnabled(true).catch((e) => {
      console.warn("[call] Failed to enable mic:", e);
    });
  }, [connectionState, localParticipant]);

  // Timer
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    const interval = setInterval(() => setCallDuration((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [connectionState]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const toggleMute = useCallback(async () => {
    if (!localParticipant) return;
    try {
      await localParticipant.setMicrophoneEnabled(isMuted);
      setIsMuted(!isMuted);
    } catch (e) {
      console.warn("Mute toggle failed:", e);
    }
  }, [localParticipant, isMuted]);

  const toggleSpeaker = useCallback(async () => {
    try {
      const next = !isSpeakerOn;
      if (Platform.OS === "ios") {
        await AudioSession.selectAudioOutput(
          next ? "force_speaker" : "default",
        );
      } else {
        await AudioSession.selectAudioOutput(next ? "speaker" : "earpiece");
      }
      setIsSpeakerOn(next);
    } catch (e) {
      console.warn("Speaker toggle failed:", e);
    }
  }, [isSpeakerOn]);

  const endCall = useCallback(() => {
    Alert.alert("End Call?", "Are you sure you want to end this call?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Call",
        style: "destructive",
        onPress: () => router.back(),
      },
    ]);
  }, [router]);

  const getStatusLabel = (state: AgentState | undefined) => {
    if (connectionState === ConnectionState.Connecting) {
      return "Connecting...";
    }
    switch (state) {
      case "connecting":
      case "initializing":
        return "Effi is starting up...";
      case "listening":
        return "Listening...";
      case "thinking":
        return "Thinking...";
      case "speaking":
        return "Speaking...";
      default:
        return "Connected";
    }
  };

  return (
    <View style={styles.container}>
      {/* Dept badge */}
      <View style={[styles.deptBadge, { backgroundColor: dept.color + "15" }]}>
        <Ionicons
          name={
            dept.id === "MUNICIPAL"
              ? "business-outline"
              : dept.id === "WATER"
                ? "water-outline"
                : "flash-outline"
          }
          size={18}
          color={dept.color}
        />
        <Text style={[styles.deptLabel, { color: dept.color }]}>
          {dept.label}
        </Text>
      </View>

      {/* Agent avatar + visualizer */}
      <View style={styles.visualizerContainer}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>E</Text>
          </View>
        </View>

        <BarVisualizer
          state={agentState}
          trackRef={audioTrack}
          barCount={7}
          style={styles.visualizer}
          options={{
            barColor: "#06B6D4",
            barWidth: 8,
            barBorderRadius: 4,
            minHeight: 0.15,
            maxHeight: 1,
          }}
        />

        <Text style={styles.statusText}>{getStatusLabel(agentState)}</Text>
      </View>

      {/* Duration */}
      {connectionState === ConnectionState.Connected && (
        <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {/* Mute button */}
        <TouchableOpacity
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={toggleMute}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={26}
            color={isMuted ? "#FCA5A5" : "#94A3B8"}
          />
          <Text
            style={[
              styles.controlBtnLabel,
              isMuted && styles.controlBtnLabelActive,
            ]}
          >
            {isMuted ? "Muted" : "Mic"}
          </Text>
        </TouchableOpacity>

        {/* Speaker button */}
        <TouchableOpacity
          style={[
            styles.controlBtn,
            isSpeakerOn && styles.controlBtnActive,
            connectionState !== ConnectionState.Connected &&
              styles.controlBtnDisabled,
          ]}
          onPress={
            connectionState === ConnectionState.Connected
              ? toggleSpeaker
              : undefined
          }
          activeOpacity={0.7}
        >
          <Ionicons
            name={isSpeakerOn ? "volume-high" : "volume-medium"}
            size={26}
            color={
              connectionState !== ConnectionState.Connected
                ? "#475569"
                : isSpeakerOn
                  ? "#6EE7B7"
                  : "#94A3B8"
            }
          />
          <Text
            style={[
              styles.controlBtnLabel,
              isSpeakerOn && styles.controlBtnLabelActive,
              connectionState !== ConnectionState.Connected &&
                styles.controlBtnLabelDisabled,
            ]}
          >
            {isSpeakerOn ? "Speaker" : "Earpiece"}
          </Text>
        </TouchableOpacity>

        {/* End call */}
        <TouchableOpacity
          style={styles.endBtn}
          onPress={endCall}
          activeOpacity={0.7}
        >
          <Ionicons
            name="call"
            size={26}
            color="#FFFFFF"
            style={{ transform: [{ rotate: "135deg" }] }}
          />
          <Text style={styles.endBtnLabel}>End Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen root ───────────────────────────────────────────────────────────────

export default function CallScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const router = useRouter();

  const { token, serverUrl, roomName, department, language } = params;

  // Configure and start the audio session here, close to when the room
  // connects. On Android this MUST be awaited in the correct order:
  // configureAudio -> startAudioSession -> room.connect.
  useEffect(() => {
    let stopped = false;
    const start = async () => {
      try {
        if (Platform.OS === "android") {
          await AudioSession.configureAudio({
            android: {
              preferredOutputList: ["earpiece", "speaker"],
              audioTypeOptions: AndroidAudioTypePresets.communication,
            },
          });
        }
        await AudioSession.startAudioSession();
        console.log("[call] Audio session started");
      } catch (e) {
        console.warn("[call] Audio session start failed:", e);
      }
    };
    start();
    return () => {
      stopped = true;
      AudioSession.stopAudioSession();
      console.log("[call] Audio session stopped");
    };
  }, []);

  if (!token || !serverUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          Missing connection details. Please go back and try again.
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={serverUrl}
      token={token}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={() => router.back()}
      onError={(e) => {
        console.error("LiveKit error:", e);
        Alert.alert("Connection Error", e.message, [
          { text: "OK", onPress: () => router.back() },
        ]);
      }}
    >
      <CallUI department={department as DepartmentId} />
    </LiveKitRoom>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0F1A",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 24,
  },
  deptBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  deptLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  visualizerContainer: {
    alignItems: "center",
    gap: 20,
  },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#0E7490",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#06B6D4",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  avatarText: {
    color: "#06B6D4",
    fontSize: 40,
    fontWeight: "800",
  },
  visualizer: {
    height: 60,
    width: 200,
  },
  statusText: {
    color: "#67E8F9",
    fontSize: 15,
    fontWeight: "500",
    opacity: 0.8,
  },
  duration: {
    color: "#E5E7EB",
    fontSize: 22,
    fontWeight: "300",
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  controlBtn: {
    alignItems: "center",
    backgroundColor: "#111827",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 6,
    minWidth: 90,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  controlBtnActive: {
    backgroundColor: "#7F1D1D",
    borderColor: "#991B1B",
  },
  controlBtnLabel: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "600",
  },
  controlBtnLabelActive: {
    color: "#FCA5A5",
  },
  endBtn: {
    alignItems: "center",
    backgroundColor: "#DC2626",
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingVertical: 16,
    gap: 6,
    minWidth: 110,
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  controlBtnDisabled: {
    opacity: 0.4,
  },
  controlBtnLabelDisabled: {
    color: "#475569",
  },
  endBtnLabel: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    backgroundColor: "#0B0F1A",
    gap: 20,
  },
  errorText: {
    color: "#6B7280",
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  backBtn: {
    backgroundColor: "#06B6D4",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backBtnText: {
    color: "#0B0F1A",
    fontSize: 16,
    fontWeight: "700",
  },
});
