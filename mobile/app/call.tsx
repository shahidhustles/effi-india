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
  useConnectionState,
  useMultibandTrackVolume,
  AudioSession,
  AndroidAudioTypePresets,
  type AgentState,
} from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { useSharedValue, useDerivedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { Canvas, Path, Skia, BlurMask } from "@shopify/react-native-skia";
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

// ─── Glowing Wave Visualizer ──────────────────────────────────────────────────

const VIS_WIDTH = 320;
const VIS_HEIGHT = 150;
const MID_Y = VIS_HEIGHT / 2;
const PTS = 12;

function GlowWaveVisualizer({
  agentState,
  audioTrack,
}: {
  agentState: AgentState | undefined;
  audioTrack: ReturnType<typeof useVoiceAssistant>["audioTrack"];
}) {
  const magnitudes = useMultibandTrackVolume(audioTrack, {
    bands: PTS,
    minFrequency: 80,
    maxFrequency: 8000,
    updateInterval: 40,
  });

  // Bridge React state → Reanimated shared value
  const magShared = useSharedValue<number[]>(new Array(PTS).fill(0));
  const stateShared = useSharedValue<string>("disconnected");

  useEffect(() => {
    magShared.value = [...magnitudes];
  }, [magnitudes, magShared]);

  useEffect(() => {
    stateShared.value = agentState ?? "disconnected";
  }, [agentState, stateShared]);

  // Phase animation on UI thread (60fps, no React re-renders)
  const phase = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 3000, easing: Easing.linear }),
      -1
    );
  }, [phase]);

  // Build wave path on UI thread each frame
  const wavePath = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const mags = magShared.value;
    const state = stateShared.value;
    const ph = phase.value;

    const stateAmp =
      state === "thinking" ? 1.8 : state === "listening" ? 1.4 : state === "speaking" ? 1.0 : 0.3;

    const ys: number[] = [];
    for (let i = 0; i < PTS; i++) {
      const xNorm = i / (PTS - 1);
      // Edge taper: 0 at edges, 1 at center — gives the ribbon shape
      const taper = Math.sin(xNorm * Math.PI);
      const sine = Math.sin(xNorm * Math.PI * 2.5 - ph) * 25 * taper;

      let y: number;
      if (state === "speaking") {
        const mag = mags[i] ?? 0;
        y = MID_Y + sine * 0.4 + mag * 55 * taper;
      } else {
        y = MID_Y + sine * stateAmp;
      }
      ys.push(y);
    }

    // Smooth cubic bezier through control points
    p.moveTo(0, ys[0]);
    for (let i = 0; i < PTS - 1; i++) {
      const x0 = (i / (PTS - 1)) * VIS_WIDTH;
      const x1 = ((i + 1) / (PTS - 1)) * VIS_WIDTH;
      const cpx = (x0 + x1) / 2;
      p.cubicTo(cpx, ys[i], cpx, ys[i + 1], x1, ys[i + 1]);
    }

    return p;
  });

  return (
    <Canvas style={waveStyles.canvas}>
      {/* Outer halo */}
      <Path
        path={wavePath}
        style="stroke"
        strokeWidth={28}
        strokeCap="round"
        color="rgba(30, 64, 175, 0.12)"
      >
        <BlurMask blur={22} style="normal" />
      </Path>

      {/* Mid glow */}
      <Path
        path={wavePath}
        style="stroke"
        strokeWidth={10}
        strokeCap="round"
        color="rgba(59, 130, 246, 0.45)"
      >
        <BlurMask blur={8} style="normal" />
      </Path>

      {/* Bright core */}
      <Path
        path={wavePath}
        style="stroke"
        strokeWidth={2.5}
        strokeCap="round"
        color="rgba(191, 219, 254, 0.95)"
      >
        <BlurMask blur={1.5} style="solid" />
      </Path>
    </Canvas>
  );
}

const waveStyles = StyleSheet.create({
  canvas: {
    width: VIS_WIDTH,
    height: VIS_HEIGHT,
  },
});

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
      {/* Top bar */}
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

      {/* Glowing wave visualizer */}
      <View style={styles.visualizerContainer}>
        <GlowWaveVisualizer agentState={agentState} audioTrack={audioTrack} />

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
