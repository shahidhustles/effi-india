import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Animated,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  LiveKitRoom,
  useVoiceAssistant,
  useLocalParticipant,
  useConnectionState,
  useMultibandTrackVolume,
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

// ─── Wave Visualizer ──────────────────────────────────────────────────────────

const BAR_COUNT = 55;
const BAR_WIDTH = 4;
const CONTOUR_HEIGHT = 150;

function getGradientColor(index: number, total: number, dim: boolean) {
  // from deep blue (#1E40AF -> 30, 64, 175) to bright cyan (#00E5FF -> 0, 229, 255)
  const ratio = index / (total - 1);
  const r = Math.round(30 + ratio * (0 - 30));
  const g = Math.round(64 + ratio * (229 - 64));
  const b = Math.round(175 + ratio * (255 - 175));
  return `rgba(${r}, ${g}, ${b}, ${dim ? 0.4 : 1})`;
}

function smoothArray(data: number[], windowSize: number): number[] {
  if (!data || !data.length) return [];
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(data.length - 1, i + windowSize); j++) {
      const dist = Math.abs(i - j);
      const weight = 1 / (dist + 1);
      sum += data[j] * weight;
      count += weight;
    }
    result.push(sum / count);
  }
  return result;
}

function WaveVisualizer({
  agentState,
  audioTrack,
}: {
  agentState: AgentState | undefined;
  audioTrack: ReturnType<typeof useVoiceAssistant>["audioTrack"];
}) {
  const magnitudes = useMultibandTrackVolume(audioTrack, {
    bands: BAR_COUNT,
    minFrequency: 80,
    maxFrequency: 8000,
    updateInterval: 40,
  });

  const animatedHeights = useRef<Animated.Value[]>(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.05))
  ).current;

  const phase = useRef(new Animated.Value(0)).current;
  const phaseVal = useRef(0);

  useEffect(() => {
    if (agentState === "speaking") return;
    const listener = phase.addListener(({ value }) => {
      phaseVal.current = value;
    });
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 2 * Math.PI,
        duration: 3000,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      phase.removeListener(listener);
      phase.setValue(0);
    };
  }, [agentState, phase]);

  useEffect(() => {
    const hasMagnitudes = magnitudes.length === BAR_COUNT;
    const isSpeaking = agentState === "speaking" && hasMagnitudes;

    let displayMags = isSpeaking ? smoothArray(magnitudes, 3) : [];

    const targets = Array.from({ length: BAR_COUNT }, (_, i) => {
      const edgeTaper = Math.sin((i / (BAR_COUNT - 1)) * Math.PI); // 0 at edges, 1 in center

      if (isSpeaking) {
        let m = displayMags[i] || 0;
        return Math.max(0.05, Math.min(1, m * edgeTaper * 1.5));
      }

      // Generative smooth wave for reading/listening/thinking
      const x = i / (BAR_COUNT - 1);
      const t = phaseVal.current;
      
      let wave = Math.sin(x * Math.PI * 3 - t * 2) * 0.15;
      wave += Math.sin(x * Math.PI * 5 + t * 1.5) * 0.08;
      
      const base = 0.2;
      const stateMultiplier =
        agentState === "thinking" ? 1.8 : agentState === "listening" ? 1.4 : 0.6;

      return Math.max(0.02, (base + wave) * edgeTaper * stateMultiplier);
    });

    const anims = animatedHeights.map((anim, i) =>
      Animated.timing(anim, {
        toValue: targets[i],
        duration: isSpeaking ? 50 : 150,
        useNativeDriver: false,
      })
    );
    const parallel = Animated.parallel(anims);
    parallel.start();
    return () => parallel.stop();
  }, [magnitudes, agentState, animatedHeights]);

  return (
    <View style={contourStyles.wrapper}>
      <View style={contourStyles.glowBackdrop} />
      <View style={contourStyles.barsRow}>
        {animatedHeights.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              contourStyles.bar,
              {
                height: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [4, CONTOUR_HEIGHT],
                }),
                backgroundColor: getGradientColor(i, BAR_COUNT, agentState !== "speaking"),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const contourStyles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: CONTOUR_HEIGHT + 40,
  },
  glowBackdrop: {
    position: "absolute",
    width: "80%",
    height: 100,
    backgroundColor: "rgba(0, 229, 255, 0.12)",
    borderRadius: 100,
    shadowColor: "#00E5FF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 8,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    height: CONTOUR_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
  },
});

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
      case "listening":
        return "Listening...";
      case "thinking":
        return "Thinking...";
      case "speaking":
        return "Speaking...";
      default:
        return "";
    }
  };

  return (
    <View style={styles.container}>
      {/* Top controls Row */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={endCall}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Assistant</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <Text style={styles.greetingText}>
        {getStatusLabel(agentState)}
      </Text>

      {/* Agent Avatar & Visualizer */}
      <View style={styles.visualizerContainer}>
        <WaveVisualizer
          agentState={agentState}
          audioTrack={audioTrack}
        />

        {connectionState === ConnectionState.Connected && (
          <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <Text style={styles.deptSubInfo}>
          Connected to {dept.label}
        </Text>
        <View style={styles.controls}>
          {/* Mute button */}
          <TouchableOpacity
            style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
            onPress={toggleMute}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isMuted ? "mic-off" : "mic"}
              size={24}
              color={isMuted ? "#EF4444" : "#475569"}
            />
          </TouchableOpacity>

          {/* End call */}
          <TouchableOpacity
            style={styles.endBtnMain}
            onPress={endCall}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={32} color="#FFFFFF" />
          </TouchableOpacity>

          {/* Speaker button */}
          <TouchableOpacity
            style={[
              styles.controlBtn,
              isSpeakerOn && styles.controlBtnActive,
              connectionState !== ConnectionState.Connected && styles.controlBtnDisabled,
            ]}
            onPress={connectionState === ConnectionState.Connected ? toggleSpeaker : undefined}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSpeakerOn ? "volume-high" : "volume-medium"}
              size={24}
              color={
                connectionState !== ConnectionState.Connected
                  ? "#CBD5E1"
                  : isSpeakerOn
                  ? "#3B82F6"
                  : "#475569"
              }
            />
          </TouchableOpacity>
        </View>
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
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  greetingText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1E293B",
    textAlign: "center",
    marginTop: 20,
    paddingHorizontal: 20,
    lineHeight: 32,
  },

  visualizerContainer: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 24,
    width: "100%",
  },
  duration: {
    color: "#64748B",
    fontSize: 16,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  
  controlsContainer: {
    width: "100%",
    alignItems: "center",
  },
  deptSubInfo: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 20,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    backgroundColor: "#FFFFFF",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  controlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnActive: {
    backgroundColor: "#E2E8F0",
  },
  controlBtnDisabled: {
    opacity: 0.5,
  },
  endBtnMain: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  errorContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#64748B",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  backBtn: {
    backgroundColor: "#1E293B",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  backBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
