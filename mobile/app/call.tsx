import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AudioWaveView from "@kaannn/react-native-waveform";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import {
  AudioSession,
  AndroidAudioTypePresets,
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useMultibandTrackVolume,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/react-native";
import {
  ConnectionState,
  RoomEvent,
  RpcError,
  Track,
  type Participant,
  type RpcInvocationData,
  type TranscriptionSegment,
} from "livekit-client";
import {
  COMPLAINT_CATEGORIES,
  type ComplaintCategoryId,
} from "../constants/config";
import { uploadComplaintEvidence } from "../lib/supabase";

const LOCATION_RPC_METHOD = "effi.provide_location";
const PHOTO_RPC_METHOD = "effi.provide_photo";
const WAVEFORM_BANDS = 12;
const WAVEFORM_SAMPLE_COUNT = 48;
const BASELINE_WAVEFORM = Array.from(
  { length: WAVEFORM_SAMPLE_COUNT },
  () => 8,
);

type TranscriptSender = "effi" | "citizen";
type ActionRequestType = "location" | "photo";
type ActionRequestStatus =
  | "waiting"
  | "running"
  | "success"
  | "denied"
  | "cancelled"
  | "error";
type RpcToolStatus = "ok" | "denied" | "cancelled" | "error";

type TranscriptMessage = {
  id: string;
  sender: TranscriptSender;
  text: string;
  isStreaming: boolean;
  transcriptionKey?: string;
  actionRequest?: {
    requestId: string;
    type: ActionRequestType;
    status: ActionRequestStatus;
    buttonLabel: string;
  };
};

type RpcRequestPayload = {
  requestId: string;
  category: ComplaintCategoryId;
  language: string;
  reason: ActionRequestType;
  prompt: string;
};

type LocationRpcResult = {
  status: RpcToolStatus;
  message?: string;
  location?: {
    coords: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
      altitude: number | null;
      altitudeAccuracy: number | null;
      heading: number | null;
      speed: number | null;
    };
    timestamp: number;
    mocked?: boolean;
  };
};

type PhotoRpcResult = {
  status: RpcToolStatus;
  message?: string;
  photoUrl?: string;
};

type PendingRpcRequest = {
  requestId: string;
  type: ActionRequestType;
  messageId: string;
  resolveResponse: (payload: string) => void;
};

function createMessageId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "");
}

function normalizeWaveSamples(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  return values.map((value) => {
    const normalized = Math.max(0.08, Math.min(1, value));
    return Math.round(normalized * 100);
  });
}

function mergeWaveSamples(local: number[], remote: number[]): number[] {
  const maxLength = Math.max(local.length, remote.length);
  const merged = Array.from({ length: maxLength }, (_, index) =>
    Math.max(local[index] ?? 0, remote[index] ?? 0),
  );

  return normalizeWaveSamples(merged);
}

function getActionButtonLabel(type: ActionRequestType): string {
  return type === "location" ? "Mark Location" : "Add Photo";
}

function getActionStatusText(
  type: ActionRequestType,
  status: ActionRequestStatus,
): string {
  const noun = type === "location" ? "Location" : "Photo";

  switch (status) {
    case "running":
      return `${noun} in progress...`;
    case "success":
      return `${noun} shared`;
    case "denied":
      return `${noun} permission denied`;
    case "cancelled":
      return `${noun} cancelled`;
    case "error":
      return `${noun} failed`;
    default:
      return getActionButtonLabel(type);
  }
}

function isSuccessfulPickerResult(
  result:
    | ImagePicker.ImagePickerResult
    | ImagePicker.ImagePickerErrorResult
    | null,
): result is ImagePicker.ImagePickerSuccessResult {
  return Boolean(result && !("code" in result) && !result.canceled);
}

function CallUI({
  category,
  language,
}: {
  category: ComplaintCategoryId;
  language: string;
}) {
  const router = useRouter();
  const room = useRoomContext();
  const flatListRef = useRef<FlatList<TranscriptMessage>>(null);
  const { agent, audioTrack } = useVoiceAssistant();
  const {
    localParticipant,
    microphoneTrack,
    isMicrophoneEnabled,
    lastMicrophoneError,
  } = useLocalParticipant();
  const connectionState = useConnectionState();

  const [samples, setSamples] = useState<number[]>(BASELINE_WAVEFORM);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pendingRpcRequestRef = useRef<PendingRpcRequest | null>(null);

  const categoryInfo =
    COMPLAINT_CATEGORIES.find((entry) => entry.id === category) ??
    COMPLAINT_CATEGORIES[0];

  const localAudioTrackRef = useMemo(() => {
    if (!microphoneTrack) {
      return undefined;
    }

    return {
      participant: localParticipant,
      publication: microphoneTrack,
      source: Track.Source.Microphone,
    };
  }, [localParticipant, microphoneTrack]);

  const localMagnitudes = useMultibandTrackVolume(localAudioTrackRef, {
    bands: WAVEFORM_BANDS,
    minFrequency: 80,
    maxFrequency: 8000,
    updateInterval: 60,
  });
  const agentMagnitudes = useMultibandTrackVolume(audioTrack, {
    bands: WAVEFORM_BANDS,
    minFrequency: 80,
    maxFrequency: 8000,
    updateInterval: 60,
  });

  const updateMessageActionStatus = useCallback(
    (requestId: string, status: ActionRequestStatus) => {
      setMessages((current) =>
        current.map((message) => {
          if (message.actionRequest?.requestId !== requestId) {
            return message;
          }

          return {
            ...message,
            actionRequest: {
              ...message.actionRequest,
              status,
            },
          };
        }),
      );
    },
    [],
  );

  const resolvePendingRequest = useCallback(
    (
      result: LocationRpcResult | PhotoRpcResult,
      uiStatus: ActionRequestStatus,
    ) => {
      const pendingRequest = pendingRpcRequestRef.current;
      if (!pendingRequest) {
        return;
      }

      pendingRpcRequestRef.current = null;
      updateMessageActionStatus(pendingRequest.requestId, uiStatus);
      pendingRequest.resolveResponse(JSON.stringify(result));
    },
    [updateMessageActionStatus],
  );

  const attachActionRequestToTranscript = useCallback(
    (payload: RpcRequestPayload, type: ActionRequestType) => {
      const promptKey = normalizeForMatch(payload.prompt);
      const actionRequest = {
        requestId: payload.requestId,
        type,
        status: "waiting" as const,
        buttonLabel: getActionButtonLabel(type),
      };

      let targetMessageId = createMessageId(`rpc-${type}`);

      setMessages((current) => {
        const next = [...current];
        let targetIndex = -1;

        for (let index = next.length - 1; index >= 0; index -= 1) {
          const candidate = next[index];
          if (candidate.sender !== "effi") {
            continue;
          }

          const candidateText = normalizeForMatch(candidate.text);
          if (
            candidateText === promptKey ||
            promptKey.includes(candidateText) ||
            candidateText.includes(promptKey)
          ) {
            targetIndex = index;
            break;
          }
        }

        if (targetIndex === -1 && next.length > 0) {
          const lastMessage = next[next.length - 1];
          if (lastMessage.sender === "effi" && !lastMessage.actionRequest) {
            targetIndex = next.length - 1;
          }
        }

        if (targetIndex === -1) {
          next.push({
            id: targetMessageId,
            sender: "effi",
            text: payload.prompt,
            isStreaming: false,
            actionRequest,
          });
          return next;
        }

        targetMessageId = next[targetIndex]?.id ?? targetMessageId;
        next[targetIndex] = {
          ...next[targetIndex],
          text: next[targetIndex]?.text || payload.prompt,
          isStreaming: next[targetIndex]?.isStreaming ?? false,
          actionRequest,
        };

        return next;
      });

      return targetMessageId;
    },
    [],
  );

  const upsertTranscriptSegment = useCallback(
    (sender: TranscriptSender, segment: TranscriptionSegment) => {
      const transcriptionKey = `${sender}:${segment.id}`;
      const normalizedText = normalizeForMatch(segment.text);

      setMessages((current) => {
        const existingIndex = current.findIndex(
          (message) => message.transcriptionKey === transcriptionKey,
        );

        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = {
            ...next[existingIndex],
            text: segment.text,
            isStreaming: !segment.final,
          };
          return next;
        }

        const next = [...current];
        let attachIndex = -1;

        if (sender === "effi") {
          for (let index = next.length - 1; index >= 0; index -= 1) {
            const candidate = next[index];
            if (
              candidate.sender !== "effi" ||
              candidate.transcriptionKey ||
              !candidate.actionRequest
            ) {
              continue;
            }

            const candidateText = normalizeForMatch(candidate.text);
            if (
              candidateText === normalizedText ||
              candidateText.includes(normalizedText) ||
              normalizedText.includes(candidateText)
            ) {
              attachIndex = index;
              break;
            }
          }
        }

        if (attachIndex >= 0) {
          next[attachIndex] = {
            ...next[attachIndex],
            text: segment.text,
            isStreaming: !segment.final,
            transcriptionKey,
          };
          return next;
        }

        next.push({
          id: createMessageId(`transcript-${sender}`),
          sender,
          text: segment.text,
          isStreaming: !segment.final,
          transcriptionKey,
        });
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      setSamples(BASELINE_WAVEFORM);
      return;
    }

    const merged = mergeWaveSamples(localMagnitudes, agentMagnitudes);
    if (merged.length === 0) {
      return;
    }

    setSamples((current) => [...current, ...merged].slice(-WAVEFORM_SAMPLE_COUNT));
  }, [agentMagnitudes, connectionState, localMagnitudes]);

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

    const interval = setInterval(() => {
      setCallDuration((value) => value + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionState]);

  useEffect(() => {
    if (lastMicrophoneError) {
      Alert.alert("Microphone Error", lastMicrophoneError.message);
    }
  }, [lastMicrophoneError]);

  useEffect(() => {
    const handleTranscription = (
      segments: TranscriptionSegment[],
      participant?: Participant,
    ) => {
      if (!participant || segments.length === 0) {
        return;
      }

      const sender: TranscriptSender | null = participant.isLocal
        ? "citizen"
        : participant.identity === agent?.identity
          ? "effi"
          : null;

      if (!sender) {
        return;
      }

      segments.forEach((segment) => {
        if (segment.text.trim()) {
          upsertTranscriptSegment(sender, segment);
        }
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [agent?.identity, room, upsertTranscriptSegment]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      return;
    }

    const handleRpcRequest = async (
      expectedType: ActionRequestType,
      data: RpcInvocationData,
    ) => {
      if (pendingRpcRequestRef.current) {
        return JSON.stringify({
          status: "error",
          message: "Another tool request is already active on this device.",
        } satisfies PhotoRpcResult | LocationRpcResult);
      }

      try {
        const payload = JSON.parse(data.payload) as RpcRequestPayload;
        if (
          !payload ||
          payload.reason !== expectedType ||
          !payload.requestId ||
          !payload.prompt
        ) {
          throw new RpcError(
            RpcError.ErrorCode.APPLICATION_ERROR,
            "Malformed RPC request payload.",
          );
        }

        const messageId = attachActionRequestToTranscript(payload, expectedType);
        return await new Promise<string>((resolve) => {
          pendingRpcRequestRef.current = {
            requestId: payload.requestId,
            type: expectedType,
            messageId,
            resolveResponse: resolve,
          };
        });
      } catch (error) {
        return JSON.stringify({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not start the requested action.",
        } satisfies PhotoRpcResult | LocationRpcResult);
      }
    };

    room.registerRpcMethod(LOCATION_RPC_METHOD, (data) =>
      handleRpcRequest("location", data),
    );
    room.registerRpcMethod(PHOTO_RPC_METHOD, (data) =>
      handleRpcRequest("photo", data),
    );

    return () => {
      room.unregisterRpcMethod(LOCATION_RPC_METHOD);
      room.unregisterRpcMethod(PHOTO_RPC_METHOD);
    };
  }, [attachActionRequestToTranscript, connectionState, room]);

  useEffect(() => {
    return () => {
      resolvePendingRequest(
        {
          status: "error",
          message: "The call ended before the requested action was completed.",
        },
        "error",
      );
    };
  }, [resolvePendingRequest]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  const formatDuration = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }, []);

  const toggleMute = useCallback(async () => {
    if (!localParticipant) {
      return;
    }

    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (error) {
      console.warn("[call] Mute toggle failed:", error);
    }
  }, [isMicrophoneEnabled, localParticipant]);

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

  const closeCall = useCallback(async () => {
    resolvePendingRequest(
      {
        status: "error",
        message: "The call ended before the requested action was completed.",
      },
      "error",
    );

    try {
      await room.disconnect();
    } catch (error) {
      console.warn("[call] Room disconnect failed:", error);
      router.back();
    }
  }, [resolvePendingRequest, room, router]);

  const endCall = useCallback(() => {
    Alert.alert("End Call?", "Are you sure you want to end this call?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End Call",
        style: "destructive",
        onPress: () => {
          void closeCall();
        },
      },
    ]);
  }, [closeCall]);

  const handleLocationRequest = useCallback(async () => {
    const pendingRequest = pendingRpcRequestRef.current;
    if (!pendingRequest || pendingRequest.type !== "location") {
      return;
    }

    updateMessageActionStatus(pendingRequest.requestId, "running");

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        resolvePendingRequest(
          {
            status: "denied",
            message: "Location permission was denied.",
          },
          "denied",
        );
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      resolvePendingRequest(
        {
          status: "ok",
          location: {
            coords: {
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
              accuracy: currentLocation.coords.accuracy ?? null,
              altitude: currentLocation.coords.altitude ?? null,
              altitudeAccuracy: currentLocation.coords.altitudeAccuracy ?? null,
              heading: currentLocation.coords.heading ?? null,
              speed: currentLocation.coords.speed ?? null,
            },
            timestamp: currentLocation.timestamp,
            ...(typeof (currentLocation as { mocked?: boolean }).mocked ===
            "boolean"
              ? { mocked: (currentLocation as { mocked: boolean }).mocked }
              : {}),
          },
        },
        "success",
      );
    } catch (error) {
      resolvePendingRequest(
        {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to capture device location.",
        },
        "error",
      );
    }
  }, [resolvePendingRequest, updateMessageActionStatus]);

  const handlePhotoSelection = useCallback(
    async (mode: "camera" | "gallery") => {
      const pendingRequest = pendingRpcRequestRef.current;
      if (!pendingRequest || pendingRequest.type !== "photo") {
        return;
      }

      updateMessageActionStatus(pendingRequest.requestId, "running");

      try {
        if (mode === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            resolvePendingRequest(
              {
                status: "denied",
                message: "Camera permission was denied.",
              },
              "denied",
            );
            return;
          }
        } else {
          const permission =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) {
            resolvePendingRequest(
              {
                status: "denied",
                message: "Photo library permission was denied.",
              },
              "denied",
            );
            return;
          }
        }

        const pendingResult =
          Platform.OS === "android"
            ? await ImagePicker.getPendingResultAsync()
            : null;

        let pickerResult:
          | ImagePicker.ImagePickerResult
          | ImagePicker.ImagePickerErrorResult
          | null = null;

        if (pendingResult && "code" in pendingResult) {
          throw new Error(pendingResult.message);
        }

        if (isSuccessfulPickerResult(pendingResult)) {
          pickerResult = pendingResult;
        }

        if (!pickerResult) {
          pickerResult =
            mode === "camera"
              ? await ImagePicker.launchCameraAsync({
                  mediaTypes: ["images"],
                  allowsEditing: true,
                  quality: 0.85,
                  exif: false,
                })
              : await ImagePicker.launchImageLibraryAsync({
                  mediaTypes: ["images"],
                  allowsEditing: true,
                  quality: 0.85,
                  exif: false,
                });
        }

        if (!isSuccessfulPickerResult(pickerResult)) {
          resolvePendingRequest(
            {
              status: "cancelled",
              message: "No photo was selected.",
            },
            "cancelled",
          );
          return;
        }

        const selectedAsset = pickerResult.assets[0];
        if (!selectedAsset) {
          resolvePendingRequest(
            {
              status: "cancelled",
              message: "No photo was selected.",
            },
            "cancelled",
          );
          return;
        }

        const { publicUrl } = await uploadComplaintEvidence({
          asset: selectedAsset,
          category,
          roomName: room.name,
          requestId: pendingRequest.requestId,
        });

        resolvePendingRequest(
          {
            status: "ok",
            photoUrl: publicUrl,
          },
          "success",
        );
      } catch (error) {
        resolvePendingRequest(
          {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to add the complaint photo.",
          },
          "error",
        );
      }
    },
    [category, resolvePendingRequest, room.name, updateMessageActionStatus],
  );

  const handlePhotoRequest = useCallback(() => {
    const pendingRequest = pendingRpcRequestRef.current;
    if (!pendingRequest || pendingRequest.type !== "photo") {
      return;
    }

    Alert.alert(
      "Add Photo",
      "Choose how you want to share the complaint photo.",
      [
        {
          text: "Take Photo",
          onPress: () => {
            void handlePhotoSelection("camera");
          },
        },
        {
          text: "Choose from Gallery",
          onPress: () => {
            void handlePhotoSelection("gallery");
          },
        },
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => {
            resolvePendingRequest(
              {
                status: "cancelled",
                message: "Photo selection was cancelled.",
              },
              "cancelled",
            );
          },
        },
      ],
    );
  }, [handlePhotoSelection, resolvePendingRequest]);

  const handleActionPress = useCallback(
    (message: TranscriptMessage) => {
      const actionRequest = message.actionRequest;
      if (!actionRequest || actionRequest.status !== "waiting") {
        return;
      }

      if (actionRequest.type === "location") {
        void handleLocationRequest();
        return;
      }

      handlePhotoRequest();
    },
    [handleLocationRequest, handlePhotoRequest],
  );

  const renderMessage = useCallback(
    ({ item }: { item: TranscriptMessage }) => {
      const isCitizen = item.sender === "citizen";
      const actionRequest = item.actionRequest;
      const isActionDisabled =
        !actionRequest || actionRequest.status !== "waiting";

      return (
        <View
          style={[
            styles.messageRow,
            isCitizen ? styles.messageCitizenRow : styles.messageEffiRow,
          ]}
        >
          <Text
            style={isCitizen ? styles.senderLabelSelf : styles.senderLabel}
          >
            {isCitizen ? "Citizen" : "Effi"}
          </Text>

          <View
            style={[
              styles.messageBubble,
              isCitizen ? styles.messageCitizen : styles.messageEffi,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                isCitizen ? styles.messageCitizenText : styles.messageEffiText,
              ]}
            >
              {item.text}
              {item.isStreaming ? "..." : ""}
            </Text>
          </View>

          {actionRequest ? (
            <View style={styles.actionGroup}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  isActionDisabled && styles.actionButtonDisabled,
                ]}
                onPress={() => handleActionPress(item)}
                activeOpacity={0.8}
                disabled={isActionDisabled}
              >
                <Text style={styles.actionText}>
                  {getActionStatusText(
                    actionRequest.type,
                    actionRequest.status,
                  )}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    },
    [handleActionPress],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.waveformContainer}>
        <Text style={styles.callMeta}>{categoryInfo.label}</Text>
        {Platform.OS === "android" ? (
          <AudioWaveView
            style={styles.waveform}
            samples={samples}
            progress={0}
            waveBackgroundColor="#94A3B8"
            waveProgressColor="#4e97bb"
            waveWidth={5}
            waveGap={3}
            waveCornerRadius={2}
            waveMinHeight={8}
          />
        ) : (
          <Text style={styles.platformWarning}>
            Live waveform preview is currently available on Android.
          </Text>
        )}
        <Text style={styles.callStatus}>
          {connectionState === ConnectionState.Connecting
            ? "Connecting..."
            : connectionState === ConnectionState.Connected
              ? `${formatDuration(callDuration)} · ${language.toUpperCase()}`
              : "Reconnecting..."}
        </Text>
      </View>

      <View style={styles.transcriptContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.transcriptList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
        />
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity
          style={[
            styles.controlButton,
            !isMicrophoneEnabled && styles.controlButtonActive,
          ]}
          onPress={() => {
            void toggleMute();
          }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons
            name={isMicrophoneEnabled ? "microphone" : "microphone-off"}
            size={28}
            color={!isMicrophoneEnabled ? "#FFFFFF" : "#1e293b"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, styles.endCallButton]}
          onPress={endCall}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="phone-hangup" size={32} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.controlButton,
            isSpeakerOn && styles.controlButtonActive,
            connectionState !== ConnectionState.Connected &&
              styles.controlButtonDisabled,
          ]}
          onPress={() => {
            if (connectionState === ConnectionState.Connected) {
              void toggleSpeaker();
            }
          }}
          activeOpacity={0.8}
          disabled={connectionState !== ConnectionState.Connected}
        >
          <MaterialCommunityIcons
            name={isSpeakerOn ? "volume-high" : "volume-medium"}
            size={28}
            color={isSpeakerOn ? "#FFFFFF" : "#1e293b"}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function CallScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const router = useRouter();

  const { token, serverUrl, category, language } = params;

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

    void start();

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
      <CallUI
        category={category as ComplaintCategoryId}
        language={language ?? "en"}
      />
    </LiveKitRoom>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  waveformContainer: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 8,
  },
  callMeta: {
    color: "#1e293b",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  waveform: {
    width: "82%",
    height: 60,
  },
  platformWarning: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
  },
  callStatus: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  transcriptContainer: {
    flex: 1,
  },
  transcriptList: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    paddingBottom: 32,
  },
  messageRow: {
    marginBottom: 20,
    maxWidth: "82%",
  },
  messageEffiRow: {
    alignSelf: "flex-start",
  },
  messageCitizenRow: {
    alignSelf: "flex-end",
  },
  senderLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 4,
    marginLeft: 4,
  },
  senderLabelSelf: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 4,
    marginRight: 4,
    textAlign: "right",
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
  },
  messageEffi: {
    backgroundColor: "#e2e8f0",
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  messageCitizen: {
    backgroundColor: "#bae6fd",
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  messageEffiText: {
    color: "#1e293b",
  },
  messageCitizenText: {
    color: "#0f172a",
  },
  actionGroup: {
    marginTop: 8,
  },
  actionButton: {
    alignSelf: "flex-start",
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  actionButtonDisabled: {
    backgroundColor: "#94A3B8",
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  controlsContainer: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "center",
    paddingTop: 18,
    paddingBottom: 24,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  controlButtonActive: {
    backgroundColor: "#64748B",
    borderColor: "#64748B",
  },
  controlButtonDisabled: {
    opacity: 0.45,
  },
  endCallButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#ef4444",
    borderWidth: 0,
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
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
