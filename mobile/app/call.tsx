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
import {
  useSharedValue,
  useDerivedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Canvas, Path, Skia, BlurMask } from "@shopify/react-native-skia";
import {
  COMPLAINT_CATEGORIES,
  type ComplaintCategoryId,
} from "../constants/config";

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

  const magShared = useSharedValue<number[]>(new Array(PTS).fill(0));
  const stateShared = useSharedValue<string>("disconnected");

  useEffect(() => {
    magShared.value = [...magnitudes];
  }, [magnitudes, magShared]);

  useEffect(() => {
    stateShared.value = agentState ?? "disconnected";
  }, [agentState, stateShared]);

  const phase = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: 3000, easing: Easing.linear }),
      -1,
    );
  }, [phase]);

  const wavePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const mags = magShared.value;
    const state = stateShared.value;
    const ph = phase.value;

    const stateAmp =
      state === "thinking"
        ? 1.8
        : state === "listening"
          ? 1.4
          : state === "speaking"
            ? 1.0
            : 0.3;

    const ys: number[] = [];
    for (let i = 0; i < PTS; i += 1) {
      const xNorm = i / (PTS - 1);
      const taper = Math.sin(xNorm * Math.PI);
      const sine = Math.sin(xNorm * Math.PI * 2.5 - ph) * 25 * taper;

      let y = MID_Y + sine * stateAmp;
      if (state === "speaking") {
        const mag = mags[i] ?? 0;
        y = MID_Y + sine * 0.4 + mag * 55 * taper;
      }
      ys.push(y);
    }

    path.moveTo(0, ys[0] ?? MID_Y);
    for (let i = 0; i < PTS - 1; i += 1) {
      const x0 = (i / (PTS - 1)) * VIS_WIDTH;
      const x1 = ((i + 1) / (PTS - 1)) * VIS_WIDTH;
      const cpx = (x0 + x1) / 2;
      path.cubicTo(
        cpx,
        ys[i] ?? MID_Y,
        cpx,
        ys[i + 1] ?? MID_Y,
        x1,
        ys[i + 1] ?? MID_Y,
      );
    }

    return path;
  });

  return (
    <Canvas style={waveStyles.canvas}>
      <Path
        path={wavePath}
        style="stroke"
        strokeWidth={28}
        strokeCap="round"
        color="rgba(30, 64, 175, 0.12)"
      >
        <BlurMask blur={22} style="normal" />
      </Path>
      <Path
        path={wavePath}
        style="stroke"
        strokeWidth={10}
        strokeCap="round"
        color="rgba(59, 130, 246, 0.45)"
      >
        <BlurMask blur={8} style="normal" />
      </Path>
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

function CallUI({ category }: { category: ComplaintCategoryId }) {
  const router = useRouter();
  const { state: agentState, audioTrack } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();

  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const categoryInfo =
    COMPLAINT_CATEGORIES.find((entry) => entry.id === category) ??
    COMPLAINT_CATEGORIES[0];

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || !localParticipant) {
      return;
    }

    localParticipant.setMicrophoneEnabled(true).catch((error) => {
      console.warn("[call] Failed to enable mic:", error);
    });
  }, [connectionState, localParticipant]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      return;
    }

    const interval = setInterval(() => setCallDuration((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [connectionState]);

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${secs}`;
  };

  const toggleMute = useCallback(async () => {
    if (!localParticipant) {
      return;
    }

    try {
      await localParticipant.setMicrophoneEnabled(isMuted);
      setIsMuted(!isMuted);
    } catch (error) {
      console.warn("[call] Mute toggle failed:", error);
    }
  }, [isMuted, localParticipant]);

  const toggleSpeaker = useCallback(async () => {
    try {
      const nextValue = !isSpeakerOn;
      if (Platform.OS === "ios") {
        await AudioSession.selectAudioOutput(
          nextValue ? "force_speaker" : "default",
        );
      } else {
        await AudioSession.selectAudioOutput(nextValue ? "speaker" : "earpiece");
      }
      setIsSpeakerOn(nextValue);
    } catch (error) {
      console.warn("[call] Speaker toggle failed:", error);
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
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={endCall}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Voice Assistant</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <Text style={styles.greetingText}>{getStatusLabel(agentState)}</Text>

      <View style={styles.visualizerContainer}>
        <GlowWaveVisualizer agentState={agentState} audioTrack={audioTrack} />

        {connectionState === ConnectionState.Connected && (
          <Text style={styles.duration}>{formatDuration(callDuration)}</Text>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <Text style={styles.deptSubInfo}>Connected to {categoryInfo.label}</Text>
        <View style={styles.controls}>
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

          <TouchableOpacity
            style={styles.endBtnMain}
            onPress={endCall}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={32} color="#FFFFFF" />
          </TouchableOpacity>

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

export default function CallScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const router = useRouter();

  const { token, serverUrl, category } = params;

  useEffect(() => {
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
      } catch (error) {
        console.warn("[call] Audio session start failed:", error);
      }
    };

    start();
    return () => {
      AudioSession.stopAudioSession();
      console.log("[call] Audio session stopped");
    };
  }, []);

  if (!token || !serverUrl || !category) {
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
      onError={(error) => {
        console.error("[call] LiveKit error:", error);
        Alert.alert("Connection Error", error.message, [
          { text: "OK", onPress: () => router.back() },
        ]);
      }}
    >
      <CallUI category={category as ComplaintCategoryId} />
    </LiveKitRoom>
  );
}

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
    paddingHorizontal: 24,
  },
  errorText: {
    color: "#0F172A",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
  },
  backBtn: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
  },
  backBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
