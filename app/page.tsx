"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIONS,
  ACTION_GUIDES,
  MovementRecognizer,
  analyzeTrainingSet,
  findInconsistentDemonstration,
  type ActionLabel,
  type ActionRecording,
  type ActionTraining,
  type LandmarkSnapshot,
  type RecognitionResult,
  type RecognitionScores,
  type RecordedFrame,
  type TrainingDiagnostics,
} from "./movement-recognition";
import {
  COMBAT_CONFIG,
  OPPONENTS,
  advanceOpponent,
  applyPlayerAction,
  createBattle,
  createGameplayData,
  favoriteSequence,
  predictNextAction,
  runCombatSelfTest,
  type ActionEvent,
  type BattleState,
  type GameplayData,
  type Prediction,
} from "./game-engine";
import { FighterArtwork } from "./fighter-art";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const POSE_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const HAND_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const FIRST_BODY_LANDMARK_INDEX = 11;
const PERFORMANCE_MODE = true;
const ENABLE_DETAILED_HAND_TRACKING = true;
const POSE_INTERVAL_MS = PERFORMANCE_MODE ? 33 : 25;
const HAND_INTERVAL_MS = PERFORMANCE_MODE ? 100 : 80;
const DEBUG_UPDATE_INTERVAL_MS = PERFORMANCE_MODE ? 250 : 150;
const RECORDING_DURATION_MS = 1_200;
const SKELETON_COLOR = "#22d3ee";
const HAND_SKELETON_COLOR = "#ec4899";
const XNNPACK_INFO_MESSAGE =
  "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.";
const FESTIVAL_MODE = true;
const DEVELOPMENT_CONTROLS =
  !FESTIVAL_MODE || process.env.NODE_ENV === "development";

const createEmptyRecognitionScores = (): RecognitionScores => ({
  ATTACK: 0,
  BLOCK: 0,
  DODGE: 0,
  SPECIAL: 0,
});

const createEmptyDetectionCounts = (): Record<ActionLabel, number> => ({
  ATTACK: 0,
  BLOCK: 0,
  DODGE: 0,
  SPECIAL: 0,
});

let mediaPipeLoggerLeaseCount = 0;
let restoreMediaPipeLogger: (() => void) | null = null;

function acquireMediaPipeLogger() {
  if (mediaPipeLoggerLeaseCount === 0) {
    const originalConsoleError = console.error;
    const mediaPipeConsoleError: typeof console.error = (...args) => {
      const isXnnpackInfo = args.some(
        (argument) =>
          typeof argument === "string" &&
          argument.includes(XNNPACK_INFO_MESSAGE),
      );

      if (isXnnpackInfo) {
        console.info(...args);
        return;
      }

      originalConsoleError(...args);
    };

    console.error = mediaPipeConsoleError;
    restoreMediaPipeLogger = () => {
      if (console.error === mediaPipeConsoleError) {
        console.error = originalConsoleError;
      }
    };
  }

  mediaPipeLoggerLeaseCount += 1;
  let isReleased = false;

  return () => {
    if (isReleased) {
      return;
    }
    isReleased = true;
    mediaPipeLoggerLeaseCount -= 1;

    if (mediaPipeLoggerLeaseCount === 0) {
      restoreMediaPipeLogger?.();
      restoreMediaPipeLogger = null;
    }
  };
}

type CapturePhase = "idle" | "countdown" | "recording" | "between";
type AppScreen =
  | "welcome"
  | "nickname"
  | "teach"
  | "preview"
  | "test"
  | "verify"
  | "similarity"
  | "battle"
  | "transition"
  | "results";
type TrackingQuality = "READY" | "MOVE BACK" | "MOVE INTO FRAME";
type PerformanceStats = {
  cameraFps: number;
  poseFps: number;
  poseMs: number;
  handFps: number;
  handMs: number;
  debugFps: number;
  skippedFrames: number;
  delegate: "GPU" | "CPU" | "STARTING";
};

type ActiveRecording = {
  label: ActionLabel;
  startedAt: number;
  frames: RecordedFrame[];
};

type PlayerSession = {
  player: {
    id: string;
    nickname: string;
  };
  moves: Partial<Record<ActionLabel, ActionTraining>>;
  gameplayData: GameplayData;
  predictionData: Record<string, never>;
};
type PlayerProjectile = { id: number; special: boolean };
type BattleGestureDebug = {
  raw: ActionLabel | null;
  emitted: ActionLabel | null;
  accepted: boolean;
};

const BODY_REPLAY_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 2],
  [2, 4],
  [4, 6],
  [4, 8],
  [4, 10],
  [1, 3],
  [3, 5],
  [5, 7],
  [5, 9],
  [5, 11],
  [0, 12],
  [1, 13],
  [12, 13],
  [12, 14],
  [14, 16],
  [16, 18],
  [18, 20],
  [16, 20],
  [13, 15],
  [15, 17],
  [17, 19],
  [19, 21],
  [17, 21],
];

const HAND_REPLAY_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

function recordingHasEnoughTracking(frames: RecordedFrame[]) {
  if (frames.length < 10) return false;
  const usefulFrames = frames.filter((frame) => {
    const body = frame.bodyLandmarks;
    const isVisible = (index: number) =>
      Boolean(body[index] && (body[index].visibility ?? 1) >= 0.22);
    const shoulders = isVisible(0) && isVisible(1);
    const leftArm = isVisible(2) && isVisible(4);
    const rightArm = isVisible(3) && isVisible(5);
    return shoulders && (leftArm || rightArm);
  });
  if (usefulFrames.length / frames.length < 0.45) return false;

  // This is pose calibration: a participant may reach the target quickly and
  // hold it. Validity is based on usable upper-body frames, not motion energy.
  return usefulFrames.length / frames.length >= 0.45;
}

function getTrackingQuality(landmarks: Array<{ x: number; y: number; visibility?: number }>): TrackingQuality {
  if (landmarks.length < 33) return "MOVE INTO FRAME";
  const isVisible = (index: number) =>
    Boolean(landmarks[index] && (landmarks[index].visibility ?? 1) >= 0.25);
  const shouldersVisible = isVisible(11) && isVisible(12);
  const leftArmVisible = isVisible(13) && isVisible(15);
  const rightArmVisible = isVisible(14) && isVisible(16);
  if (!shouldersVisible || (!leftArmVisible && !rightArmVisible)) {
    return "MOVE INTO FRAME";
  }
  const shoulderWidth = Math.abs(landmarks[11].x - landmarks[12].x);
  const upperBodyPoints = [11, 12, 13, 14, 15, 16]
    .map((index) => landmarks[index])
    .filter(Boolean);
  const touchesEdge = upperBodyPoints.some(
    (landmark) => landmark.x < -0.08 || landmark.x > 1.08 || landmark.y < -0.08,
  );
  return shoulderWidth > 0.72 || touchesEdge ? "MOVE BACK" : "READY";
}

function MovePreview({
  recording,
  onBack,
}: {
  recording: ActionRecording;
  onBack: () => void;
}) {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || recording.frames.length === 0) {
      return;
    }

    let animationFrameId: number;
    const playbackStartedAt = performance.now();

    const drawLandmarkSet = (
      landmarks: LandmarkSnapshot[],
      connections: ReadonlyArray<readonly [number, number]>,
    ) => {
      const isHand = connections === HAND_REPLAY_CONNECTIONS;
      context.strokeStyle = isHand ? HAND_SKELETON_COLOR : SKELETON_COLOR;
      context.fillStyle = isHand ? HAND_SKELETON_COLOR : "#e0f2fe";
      context.lineWidth = isHand ? 2 : 3;

      for (const [start, end] of connections) {
        const first = landmarks[start];
        const second = landmarks[end];
        if (!first || !second) {
          continue;
        }
        context.beginPath();
        context.moveTo(first.x * canvas.width, first.y * canvas.height);
        context.lineTo(second.x * canvas.width, second.y * canvas.height);
        context.stroke();
      }

      for (const landmark of landmarks) {
        context.beginPath();
        context.arc(
          landmark.x * canvas.width,
          landmark.y * canvas.height,
          isHand ? 2.5 : 3,
          0,
          Math.PI * 2,
        );
        context.fill();
      }
    };

    const drawFrame = () => {
      const playbackTime =
        (performance.now() - playbackStartedAt) % recording.durationMs;
      let frame = recording.frames[0];
      for (const candidate of recording.frames) {
        if (candidate.timestampMs > playbackTime) {
          break;
        }
        frame = candidate;
      }

      context.fillStyle = "#020617";
      context.fillRect(0, 0, canvas.width, canvas.height);
      drawLandmarkSet(frame.bodyLandmarks, BODY_REPLAY_CONNECTIONS);
      for (const hand of frame.hands) {
        drawLandmarkSet(hand.landmarks, HAND_REPLAY_CONNECTIONS);
      }

      animationFrameId = requestAnimationFrame(drawFrame);
    };

    animationFrameId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [recording]);

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-950 p-8 text-white">
      <h1 className="text-3xl font-bold">This is what the computer learned</h1>
      <p className="mt-2 text-cyan-300">{recording.label}</p>
      <canvas
        ref={previewCanvasRef}
        width={640}
        height={480}
        className="mt-6 w-full max-w-3xl -scale-x-100 rounded-2xl border border-slate-700 bg-black"
      />
      {recording.frames.length === 0 && (
        <p className="mt-4 text-amber-300">No tracking frames were captured.</p>
      )}
      <button
        type="button"
        onClick={onBack}
        className="mt-6 rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-slate-950"
      >
        Back to Your Moves
      </button>
    </main>
  );
}

function HealthBar({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: number;
  align?: "left" | "right";
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const [damageMemory, setDamageMemory] = useState(safeValue);
  const previousValueRef = useRef(safeValue);
  const memoryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (safeValue >= previousValueRef.current) {
      setDamageMemory(safeValue);
    } else {
      if (memoryTimerRef.current !== null) window.clearTimeout(memoryTimerRef.current);
      memoryTimerRef.current = window.setTimeout(() => {
        setDamageMemory(safeValue);
        memoryTimerRef.current = null;
      }, 360);
    }
    previousValueRef.current = safeValue;
    return () => {
      if (memoryTimerRef.current !== null) window.clearTimeout(memoryTimerRef.current);
    };
  }, [safeValue]);

  return (
    <div className={`${align === "right" ? "text-right" : "text-left"} ${safeValue <= 35 ? "health-low" : ""}`}>
      <div className={`mb-1 flex text-sm font-black uppercase tracking-[0.18em] ${align === "right" ? "justify-end" : "justify-start"}`}>
        {label}
      </div>
      <div className={`health-shell ${align === "right" ? "health-right" : ""}`}>
        <div className="health-memory" style={{ width: `${damageMemory}%` }} />
        <div
          className={`health-fill ${safeValue > 35 ? "" : "health-danger"}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function Fighter({
  name,
  side,
  animation,
  opponentNumber = 0,
  combatFeedback,
}: {
  name: string;
  side: "player" | "opponent";
  animation: BattleState["playerAnimation"];
  opponentNumber?: number;
  combatFeedback?: BattleState["feedback"];
}) {
  const identity = side === "player" ? "hero" : `enemy-${opponentNumber}`;
  return (
    <div className={`fighter fighter-${side} ${identity} fighter-${animation.toLowerCase()} ${side === "player" && combatFeedback === "REFLECTED!" ? "fighter-reflect" : ""}`}>
      <div className="fighter-aura" />
      <div className="fighter-silhouette">
        <FighterArtwork side={side} opponentNumber={opponentNumber} name={name}/>
      </div>
      <p className="fighter-name">{name}</p>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-950 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-black text-cyan-300">{value}</p>
    </div>
  );
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackingSessionRef = useRef(0);
  const handTrackingResultRef =
    useRef<import("@mediapipe/tasks-vision").HandLandmarkerResult | null>(null);
  const activeRecordingRef = useRef<ActiveRecording | null>(null);
  const pendingDemonstrationsRef = useRef<ActionRecording[]>([]);
  const movementRecognizerRef = useRef<MovementRecognizer | null>(null);
  const recognitionResultRef = useRef<RecognitionResult | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const nextExampleTimerRef = useRef<number | null>(null);
  const recognitionFlashTimerRef = useRef<number | null>(null);
  const roundTransitionTimerRef = useRef<number | null>(null);
  const verificationTimerRef = useRef<number | null>(null);
  const verificationIndexRef = useRef(0);
  const trackingQualityRef = useRef<TrackingQuality>("MOVE INTO FRAME");
  const actionEventHandlerRef = useRef<((event: ActionEvent) => void) | null>(null);
  const actionHistoryRef = useRef<ActionLabel[]>([]);
  const battleStateRef = useRef<BattleState | null>(null);
  const battleStartedAtRef = useRef(0);
  const roundRecordedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isMutedRef = useRef(false);
  const [screen, setScreen] = useState<AppScreen>("welcome");
  const [nicknameInput, setNicknameInput] = useState("");
  const [currentSession, setCurrentSession] =
    useState<PlayerSession | null>(null);
  const [previewAction, setPreviewAction] = useState<ActionLabel | null>(null);
  const [recognitionScores, setRecognitionScores] = useState(
    createEmptyRecognitionScores,
  );
  const [detectedAction, setDetectedAction] = useState<ActionLabel | null>(null);
  const [flashedAction, setFlashedAction] = useState<ActionLabel | null>(null);
  const [detectionCounts, setDetectionCounts] = useState(
    createEmptyDetectionCounts,
  );
  const [recognitionLatency, setRecognitionLatency] = useState<number | null>(null);
  const [trackingQuality, setTrackingQuality] =
    useState<TrackingQuality>("MOVE INTO FRAME");
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [livePrediction, setLivePrediction] = useState<Prediction | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [trackingRetryKey, setTrackingRetryKey] = useState(0);
  const [poseStatus, setPoseStatus] = useState(
    "Loading pose and hand models...",
  );
  const [selectedAction, setSelectedAction] =
    useState<ActionLabel>("ATTACK");
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [teachingExample, setTeachingExample] = useState<number | null>(null);
  const [recordingIssue, setRecordingIssue] = useState("");
  const [verificationIndex, setVerificationIndex] = useState(0);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [trainingDiagnostics, setTrainingDiagnostics] =
    useState<TrainingDiagnostics | null>(null);
  const [similarityAccepted, setSimilarityAccepted] = useState(false);
  const [expectedDebugAction, setExpectedDebugAction] =
    useState<ActionLabel | null>(null);
  const expectedDebugActionRef = useRef<ActionLabel | null>(null);
  const [recognitionDebug, setRecognitionDebug] = useState<RecognitionResult["debug"]>(undefined);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats>({
    cameraFps: 0, poseFps: 0, poseMs: 0, handFps: 0, handMs: 0,
    debugFps: 0, skippedFrames: 0, delegate: "STARTING",
  });
  const [actionTrace, setActionTrace] = useState("");
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [playerProjectile, setPlayerProjectile] = useState<PlayerProjectile | null>(null);
  const projectileTimerRef = useRef<number | null>(null);
  const actionLabelTimerRef = useRef<number | null>(null);
  const specialNotReadyTimerRef = useRef<number | null>(null);
  const [visibleActionLabel, setVisibleActionLabel] = useState<ActionLabel | null>(null);
  const [specialNotReady, setSpecialNotReady] = useState(false);
  const [battleGestureDebug, setBattleGestureDebug] = useState<BattleGestureDebug>({ raw: null, emitted: null, accepted: false });
  const eventLogRef = useRef<string[]>([]);
  const traceEvent = useCallback((label: string) => {
    const next = [...eventLogRef.current, `${(performance.now() / 1000).toFixed(3)} ${label}`].slice(-20);
    eventLogRef.current = next;
    setEventLog(next);
  }, []);
  const [combatSelfTest] = useState<ReturnType<typeof runCombatSelfTest> | null>(() =>
    DEVELOPMENT_CONTROLS ? runCombatSelfTest() : null,
  );
  const recordings = currentSession?.moves ?? {};
  const readyMoveCount = ACTIONS.length;

  const playTone = useCallback((frequency: number, durationMs = 100) => {
    if (isMutedRef.current) return;
    const AudioContextClass = window.AudioContext;
    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      context.currentTime + durationMs / 1000,
    );
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + durationMs / 1000);
  }, []);

  function toggleSound() {
    isMutedRef.current = !isMutedRef.current;
    setIsMuted(isMutedRef.current);
    if (!isMutedRef.current) playTone(520, 70);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error("Fullscreen is unavailable.", error);
    }
  }

  function clearCaptureTimers() {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (nextExampleTimerRef.current !== null) {
      window.clearTimeout(nextExampleTimerRef.current);
      nextExampleTimerRef.current = null;
    }
  }

  function beginRecording(label: ActionLabel) {
    activeRecordingRef.current = {
      label,
      // The first valid video timestamp becomes the canonical recording origin.
      startedAt: 0,
      frames: [],
    };
    setCapturePhase("recording");

    recordingTimerRef.current = window.setTimeout(() => {
      const completedRecording = activeRecordingRef.current;
      if (completedRecording) {
        if (!recordingHasEnoughTracking(completedRecording.frames)) {
          setRecordingIssue("Couldn't see your arms clearly. Try again.");
          setCapturePhase("between");
          nextExampleTimerRef.current = window.setTimeout(() => {
            setRecordingIssue("");
            beginCountdown(completedRecording.label);
            nextExampleTimerRef.current = null;
          }, 1_200);
          activeRecordingRef.current = null;
          recordingTimerRef.current = null;
          return;
        }
        const demonstration: ActionRecording = {
          label: completedRecording.label,
          recordedAt: Date.now(),
          durationMs: RECORDING_DURATION_MS,
          frames: completedRecording.frames,
        };
        if (DEVELOPMENT_CONTROLS) console.info("[YR-RECOG] calibration saved", completedRecording.label, { frames: demonstration.frames.length });
        const candidateDemonstrations = [
          ...pendingDemonstrationsRef.current,
          demonstration,
        ];
        pendingDemonstrationsRef.current = candidateDemonstrations;

        if (pendingDemonstrationsRef.current.length === 1) {
          const inconsistentIndex = findInconsistentDemonstration(
            candidateDemonstrations,
          );
          if (inconsistentIndex !== null) {
            pendingDemonstrationsRef.current =
              candidateDemonstrations.filter(
                (_, index) => index !== inconsistentIndex,
              );
            setTeachingExample(inconsistentIndex + 1);
            setRecordingIssue("That one looked different. Try it again.");
            setCapturePhase("between");
            nextExampleTimerRef.current = window.setTimeout(() => {
              setRecordingIssue("");
              beginCountdown(completedRecording.label);
              nextExampleTimerRef.current = null;
            }, 1_200);
            activeRecordingRef.current = null;
            recordingTimerRef.current = null;
            return;
          }
          const demonstrations = pendingDemonstrationsRef.current;
          setCurrentSession((current) =>
            current
              ? {
                  ...current,
                  moves: {
                    ...current.moves,
                    [completedRecording.label]: {
                      label: completedRecording.label,
                      learnedAt: Date.now(),
                      demonstrations,
                    },
                  },
                }
              : current,
          );
          pendingDemonstrationsRef.current = [];
          setTeachingExample(null);
          setCapturePhase("idle");
          playTone(760, 180);
        } else {
          setCapturePhase("idle");
        }
      }
      activeRecordingRef.current = null;
      recordingTimerRef.current = null;
    }, RECORDING_DURATION_MS);
  }

  function beginCountdown(actionToRecord: ActionLabel) {
    setRecordingIssue("");
    let secondsRemaining = 3;
    setSelectedAction(actionToRecord);
    setCapturePhase("countdown");
    setCountdown(secondsRemaining);
    playTone(360, 70);

    countdownTimerRef.current = window.setInterval(() => {
      secondsRemaining -= 1;
      if (secondsRemaining > 0) {
        setCountdown(secondsRemaining);
        playTone(360, 70);
        return;
      }

      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
      setCountdown(null);
      playTone(620, 100);
      window.setTimeout(() => beginRecording(actionToRecord), 600);
    }, 1_000);
  }

  function startTeaching(action: ActionLabel) {
    if (capturePhase !== "idle") return;
    setVerificationComplete(false);
    setTrainingDiagnostics(null);
    setSimilarityAccepted(false);
    setExpectedDebugAction(null);
    expectedDebugActionRef.current = null;
    setRecognitionDebug(undefined);
    setActionTrace("");
    movementRecognizerRef.current = null;
    pendingDemonstrationsRef.current = [];
    setTeachingExample(1);
    beginCountdown(action);
  }

  function resetRecordings() {
    clearCaptureTimers();
    activeRecordingRef.current = null;
    pendingDemonstrationsRef.current = [];
    setCountdown(null);
    setCapturePhase("idle");
    setTeachingExample(null);
    setVerificationComplete(false);
    setTrainingDiagnostics(null);
    setSimilarityAccepted(false);
    setExpectedDebugAction(null);
    expectedDebugActionRef.current = null;
    setRecognitionDebug(undefined);
    setActionTrace("");
    eventLogRef.current = [];
    setEventLog([]);
    setCurrentSession((current) =>
      current ? { ...current, moves: {} } : current,
    );
  }

  function startNewPlayer() {
    if (projectileTimerRef.current !== null) { window.clearTimeout(projectileTimerRef.current); projectileTimerRef.current = null; }
    if (actionLabelTimerRef.current !== null) { window.clearTimeout(actionLabelTimerRef.current); actionLabelTimerRef.current = null; }
    if (specialNotReadyTimerRef.current !== null) { window.clearTimeout(specialNotReadyTimerRef.current); specialNotReadyTimerRef.current = null; }
    setPlayerProjectile(null);
    setVisibleActionLabel(null);
    setSpecialNotReady(false);
    clearCaptureTimers();
    if (recognitionFlashTimerRef.current !== null) {
      window.clearTimeout(recognitionFlashTimerRef.current);
      recognitionFlashTimerRef.current = null;
    }
    activeRecordingRef.current = null;
    pendingDemonstrationsRef.current = [];
    movementRecognizerRef.current = null;
    recognitionResultRef.current = null;
    actionEventHandlerRef.current = null;
    actionHistoryRef.current = [];
    battleStateRef.current = null;
    roundRecordedRef.current = false;
    if (roundTransitionTimerRef.current !== null) {
      window.clearTimeout(roundTransitionTimerRef.current);
      roundTransitionTimerRef.current = null;
    }
    setCapturePhase("idle");
    setTeachingExample(null);
    setCountdown(null);
    setSelectedAction("ATTACK");
    setPreviewAction(null);
    setCurrentSession(null);
    setBattleState(null);
    setLivePrediction(null);
    setRecognitionLatency(null);
    setVerificationIndex(0);
    verificationIndexRef.current = 0;
    setVerificationMessage("");
    setVerificationComplete(false);
    setTrainingDiagnostics(null);
    setSimilarityAccepted(false);
    setExpectedDebugAction(null);
    expectedDebugActionRef.current = null;
    setRecognitionDebug(undefined);
    setActionTrace("");
    eventLogRef.current = [];
    setEventLog([]);
    setTrackingQuality("MOVE INTO FRAME");
    trackingQualityRef.current = "MOVE INTO FRAME";
    setNicknameInput("");
    setCameraError("");
    setScreen("nickname");
  }

  function resetToHome() {
    startNewPlayer();
    setScreen("welcome");
  }

  function createPlayerSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = nicknameInput.trim();
    if (!nickname) {
      return;
    }

    setCurrentSession({
      player: {
        id: crypto.randomUUID(),
        nickname,
      },
      moves: {},
      gameplayData: createGameplayData(),
      predictionData: {},
    });
    setPoseStatus("Loading pose and hand models...");
    setCameraError("");
    movementRecognizerRef.current = new MovementRecognizer();
    movementRecognizerRef.current.resetRuntime();
    verificationIndexRef.current = 0;
    setVerificationIndex(0);
    setVerificationMessage("");
    setVerificationComplete(false);
    setScreen("verify");
  }

  function returnToMoveSetup() {
    movementRecognizerRef.current = null;
    recognitionResultRef.current = null;
    if (recognitionFlashTimerRef.current !== null) {
      window.clearTimeout(recognitionFlashTimerRef.current);
      recognitionFlashTimerRef.current = null;
    }
    setPreviewAction(null);
    setPoseStatus("Loading pose and hand models...");
    setCameraError("");
    setScreen("teach");
  }

  function startTestMode() {
    if (readyMoveCount !== ACTIONS.length) {
      return;
    }

    movementRecognizerRef.current ??= new MovementRecognizer();
    movementRecognizerRef.current.resetRuntime();
    recognitionResultRef.current = null;
    setRecognitionScores(createEmptyRecognitionScores());
    setDetectedAction(null);
    setFlashedAction(null);
    setDetectionCounts(createEmptyDetectionCounts());
    setRecognitionLatency(null);
    setPoseStatus("Loading pose and hand models...");
    setCameraError("");
    setScreen("test");
  }

  function startQuickCheck() {
    if (readyMoveCount !== ACTIONS.length) return;
    movementRecognizerRef.current ??= new MovementRecognizer();
    movementRecognizerRef.current.resetBaseline();
    verificationIndexRef.current = 0;
    setVerificationIndex(0);
    setVerificationMessage("");
    setVerificationComplete(false);
    setRecognitionScores(createEmptyRecognitionScores());
    setPoseStatus("Loading pose and hand models...");
    setScreen("verify");
  }

  function startBattle(battleNumber: number) {
    if (readyMoveCount !== ACTIONS.length) return;
    movementRecognizerRef.current ??= new MovementRecognizer();
    movementRecognizerRef.current.resetRuntime();
    recognitionResultRef.current = null;
    const nextBattle = createBattle(battleNumber, performance.now());
    battleStateRef.current = nextBattle;
    battleStartedAtRef.current = performance.now();
    roundRecordedRef.current = false;
    setBattleState(nextBattle);
    setLivePrediction(predictNextAction(actionHistoryRef.current, battleNumber));
    setRecognitionScores(createEmptyRecognitionScores());
    setDetectedAction(null);
    setVisibleActionLabel(null);
    if (specialNotReadyTimerRef.current !== null) window.clearTimeout(specialNotReadyTimerRef.current);
    specialNotReadyTimerRef.current = null;
    setSpecialNotReady(false);
    setBattleGestureDebug({ raw: null, emitted: null, accepted: false });
    setPoseStatus("Loading pose and hand models...");
    setCameraError("");
    setScreen("battle");
    playTone(440, 120);
  }

  function dispatchActionEvent(action: ActionLabel, source: "movement" | "keyboard") {
    const state = battleStateRef.current;
    if (!state || state.status !== "playing") {
      setBattleGestureDebug((current) => ({ ...current, emitted: action, accepted: false }));
      return;
    }
    const now = performance.now();
    const event: ActionEvent = { action, timestampMs: now, source };
    const historyBeforeAction = actionHistoryRef.current;
    const update = applyPlayerAction(state, event, historyBeforeAction);
    const acceptedAction = update.acceptedAction;
    battleStateRef.current = update.state;
    setBattleState(update.state);
    setBattleGestureDebug((current) => ({ ...current, emitted: action, accepted: acceptedAction !== null }));
    traceEvent(`battle.action ${action}`);
    traceEvent(`result ${update.metric.outcome}`);
    setActionTrace(
      `Battle received \${action} → \${update.metric.outcome}`,
    );
    if (action === "SPECIAL" && update.metric.outcome === "charging") {
      if (specialNotReadyTimerRef.current !== null) window.clearTimeout(specialNotReadyTimerRef.current);
      setSpecialNotReady(false);
      window.requestAnimationFrame(() => setSpecialNotReady(true));
      specialNotReadyTimerRef.current = window.setTimeout(() => {
        setSpecialNotReady(false);
        specialNotReadyTimerRef.current = null;
      }, 800);
    }
    if (!acceptedAction) return;

    if (acceptedAction === "SPECIAL") {
      if (specialNotReadyTimerRef.current !== null) window.clearTimeout(specialNotReadyTimerRef.current);
      specialNotReadyTimerRef.current = null;
      setSpecialNotReady(false);
    }

    actionHistoryRef.current = [...historyBeforeAction, acceptedAction].slice(-200);
    setLivePrediction(predictNextAction(actionHistoryRef.current, state.battleNumber));
    setVisibleActionLabel(acceptedAction);
    if (actionLabelTimerRef.current !== null) window.clearTimeout(actionLabelTimerRef.current);
    actionLabelTimerRef.current = window.setTimeout(() => {
      setVisibleActionLabel(null);
      actionLabelTimerRef.current = null;
    }, 650);

    if (acceptedAction === "ATTACK" || acceptedAction === "SPECIAL") {
      if (projectileTimerRef.current !== null) window.clearTimeout(projectileTimerRef.current);
      setPlayerProjectile({ id: now, special: acceptedAction === "SPECIAL" });
      projectileTimerRef.current = window.setTimeout(() => {
        setPlayerProjectile(null);
        projectileTimerRef.current = null;
      }, acceptedAction === "SPECIAL" ? 1_180 : 620);
    }

    setCurrentSession((current) => {
      if (!current) return current;
      const metric = {
        ...update.metric,
        timestampMs: now - current.gameplayData.sessionStartedAt,
      };
      const prediction = update.prediction
        ? {
            ...update.prediction,
            timestampMs: now - current.gameplayData.sessionStartedAt,
          }
        : null;
      return {
        ...current,
        gameplayData: {
          ...current.gameplayData,
          actions: [...current.gameplayData.actions, metric],
          predictions: prediction
            ? [...current.gameplayData.predictions, prediction]
            : current.gameplayData.predictions,
          successfulAttacks:
            current.gameplayData.successfulAttacks +
            (update.metric.outcome === "hit" ? 1 : 0),
          successfulSpecials:
            current.gameplayData.successfulSpecials +
            (update.metric.outcome === "special-hit" ? 1 : 0),
        },
      };
    });

    playTone(
      acceptedAction === "SPECIAL" ? 720 : acceptedAction === "ATTACK" ? 520 : 360,
      acceptedAction === "SPECIAL" ? 220 : 100,
    );
  }

  useEffect(() => {
    actionEventHandlerRef.current = (event) =>
      dispatchActionEvent(event.action, event.source);
  });

  useEffect(() => {
    return () => {
      if (projectileTimerRef.current !== null) window.clearTimeout(projectileTimerRef.current);
      if (actionLabelTimerRef.current !== null) window.clearTimeout(actionLabelTimerRef.current);
      if (specialNotReadyTimerRef.current !== null) window.clearTimeout(specialNotReadyTimerRef.current);
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
      }
      if (recordingTimerRef.current !== null) {
        window.clearTimeout(recordingTimerRef.current);
      }
      if (nextExampleTimerRef.current !== null) {
        window.clearTimeout(nextExampleTimerRef.current);
      }
      if (recognitionFlashTimerRef.current !== null) {
        window.clearTimeout(recognitionFlashTimerRef.current);
      }
      if (roundTransitionTimerRef.current !== null) {
        window.clearTimeout(roundTransitionTimerRef.current);
      }
      if (verificationTimerRef.current !== null) {
        window.clearTimeout(verificationTimerRef.current);
      }
      activeRecordingRef.current = null;
      movementRecognizerRef.current = null;
      audioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (screen !== "teach" && screen !== "test" && screen !== "verify" && screen !== "battle") {
      return;
    }

    const sessionId = trackingSessionRef.current + 1;
    trackingSessionRef.current = sessionId;
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;
    let videoFrameCallbackId: number | null = null;
    let isCancelled = false;
    let videoElement: HTMLVideoElement | null = null;
    let poseLandmarker: import("@mediapipe/tasks-vision").PoseLandmarker | null =
      null;
    let handLandmarker: import("@mediapipe/tasks-vision").HandLandmarker | null =
      null;

    const isCurrentSession = () =>
      !isCancelled && trackingSessionRef.current === sessionId;

    async function startPoseTracking() {
      const releaseMediaPipeLogger = acquireMediaPipeLogger();

      try {
        const {
          DrawingUtils,
          FilesetResolver,
          HandLandmarker,
          PoseLandmarker,
        } = await import("@mediapipe/tasks-vision");

        const [cameraStream, vision] = await Promise.all([
          navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 30, max: 30 },
            },
            audio: false,
          }),
          FilesetResolver.forVisionTasks(WASM_PATH),
        ]);

        stream = cameraStream;
        if (!isCurrentSession()) {
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const poseOptions = {
          runningMode: "VIDEO" as const,
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        };
        try {
          poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            ...poseOptions,
            baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate: "GPU" },
          });
          setPerformanceStats((current) => ({ ...current, delegate: "GPU" }));
        } catch (gpuError) {
          console.warn("MediaPipe GPU delegate unavailable; using CPU.", gpuError);
          poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            ...poseOptions,
            baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate: "CPU" },
          });
          setPerformanceStats((current) => ({ ...current, delegate: "CPU" }));
        }

        if (!isCurrentSession()) {
          poseLandmarker.close();
          poseLandmarker = null;
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const handTrackingEnabled = ENABLE_DETAILED_HAND_TRACKING && screen !== "battle";
        if (handTrackingEnabled) {
          try {
            handLandmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: HAND_MODEL_PATH, delegate: "GPU" },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
          } catch {
            handLandmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: { modelAssetPath: HAND_MODEL_PATH, delegate: "CPU" },
              runningMode: "VIDEO",
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
          }
        }

        if (!isCurrentSession()) {
          handLandmarker?.close();
          handLandmarker = null;
          poseLandmarker?.close();
          poseLandmarker = null;
          cameraStream.getTracks().forEach((track) => track.stop());
          return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          throw new Error("Video or canvas element is unavailable.");
        }

        videoElement = video;
        video.srcObject = cameraStream;
        await video.play();

        if (!isCurrentSession()) {
          return;
        }

        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas 2D context is unavailable.");
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const drawingUtils = new DrawingUtils(context);
        const bodyConnections = PoseLandmarker.POSE_CONNECTIONS.filter(
          ({ start, end }) =>
            start >= FIRST_BODY_LANDMARK_INDEX &&
            end >= FIRST_BODY_LANDMARK_INDEX,
        );
        let lastVideoTime = -1;
        let lastPoseAt = -Infinity;
        let lastHandAt = -Infinity;
        let lastDebugUpdateAt = -Infinity;
        let lastMediaPipeTimestamp = -1;
        let isInferenceRunning = false;
        let lastDetectedGesture: ActionLabel | null = null;
        let metricsStartedAt = performance.now();
        let cameraFrames = 0, poseFrames = 0, poseTimeTotal = 0;
        let handFrames = 0, handTimeTotal = 0, debugUpdates = 0, skippedFrames = 0;
        setPoseStatus(handTrackingEnabled ? "Pose and hand tracking active" : "Pose tracking active");

        const scheduleNextFrame = () => {
          if (!isCurrentSession()) return;
          if ("requestVideoFrameCallback" in video) {
            videoFrameCallbackId = video.requestVideoFrameCallback((now) => detectPose(now));
          } else {
            animationFrameId = requestAnimationFrame(detectPose);
          }
        };

        const detectPose = (frameNow = performance.now()) => {
          cameraFrames += 1;
          if (!isCurrentSession() || !poseLandmarker) {
            return;
          }

          if (
            video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            video.videoWidth <= 0 ||
            video.videoHeight <= 0 ||
            video.paused ||
            video.ended ||
            isInferenceRunning
          ) {
            skippedFrames += 1;
            scheduleNextFrame();
            return;
          }

          if (video.currentTime === lastVideoTime || frameNow - lastPoseAt < POSE_INTERVAL_MS) {
            skippedFrames += 1;
            scheduleNextFrame();
            return;
          }
          lastVideoTime = video.currentTime;
          lastPoseAt = frameNow;

          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          const timestamp = Math.max(
            performance.now(),
            lastMediaPipeTimestamp + 0.001,
          );
          lastMediaPipeTimestamp = timestamp;
          isInferenceRunning = true;

          try {
            const poseStartedAt = performance.now();
            const result = poseLandmarker.detectForVideo(video, timestamp);
            poseTimeTotal += performance.now() - poseStartedAt;
            poseFrames += 1;
            let handResult = handTrackingResultRef.current;
            const quality = getTrackingQuality(result.landmarks[0] ?? []);
            if (quality !== trackingQualityRef.current) {
              trackingQualityRef.current = quality;
              setTrackingQuality(quality);
            }

            const trackingFrame: RecordedFrame = {
              timestampMs: timestamp,
              bodyLandmarks: result.landmarks[0] ?? [],
              bodyWorldLandmarks: [],
              hands: [],
            };

            const activeRecording = activeRecordingRef.current;
            if (activeRecording) {
              if (activeRecording.startedAt === 0) {
                activeRecording.startedAt = timestamp;
              }
              activeRecording.frames.push({
                ...trackingFrame,
                timestampMs: timestamp - activeRecording.startedAt,
              });
            }

            if (
              (screen === "test" || screen === "verify" || screen === "battle") &&
              movementRecognizerRef.current
            ) {
              const recognition = movementRecognizerRef.current.addFrame(
                trackingFrame,
                timestamp,
              );
              recognitionResultRef.current = recognition;
              if (screen !== "battle" && timestamp - lastDebugUpdateAt >= DEBUG_UPDATE_INTERVAL_MS) {
                setRecognitionScores(recognition.scores);
                setRecognitionDebug(recognition.debug);
                setDetectedAction(recognition.detectedAction);
                lastDebugUpdateAt = timestamp;
                debugUpdates += 1;
              } else if (screen === "test" && recognition.detectedAction !== lastDetectedGesture) {
                setDetectedAction(recognition.detectedAction);
              }
              if (screen === "battle" && recognition.detectedAction !== lastDetectedGesture) {
                setBattleGestureDebug({ raw: recognition.detectedAction, emitted: null, accepted: false });
              }
              lastDetectedGesture = recognition.detectedAction;

              if (recognition.emittedAction) {
                const emittedAction = recognition.emittedAction;
                if (screen === "battle") {
                  setBattleGestureDebug({ raw: recognition.detectedAction, emitted: emittedAction, accepted: false });
                }
                traceEvent(`recognition ${emittedAction}`);
                if (screen === "test" && expectedDebugActionRef.current) {
                  setActionTrace(
                    `Expected: ${expectedDebugActionRef.current} · Recognized: ${emittedAction}`,
                  );
                  setExpectedDebugAction(null);
                  expectedDebugActionRef.current = null;
                }
                if (screen === "battle") {
                  setActionTrace(`Recognizer emitted ${emittedAction}`);
                }
                if (screen === "test") {
                  setRecognitionLatency(recognition.latencyMs);
                  setDetectionCounts((current) => ({
                    ...current,
                    [emittedAction]: current[emittedAction] + 1,
                  }));
                  setFlashedAction(emittedAction);
                  if (recognitionFlashTimerRef.current !== null) {
                    window.clearTimeout(recognitionFlashTimerRef.current);
                  }
                  recognitionFlashTimerRef.current = window.setTimeout(() => {
                    setFlashedAction(null);
                    recognitionFlashTimerRef.current = null;
                  }, 600);
                }
                if (screen === "battle") {
                  actionEventHandlerRef.current?.({
                    action: emittedAction,
                    timestampMs: timestamp,
                    source: "movement",
                  });
                } else if (screen === "verify") {
                  const currentVerificationIndex = verificationIndexRef.current;
                  const expected = ACTIONS[currentVerificationIndex];
                  if (emittedAction === expected) {
                    setVerificationMessage("✓ RECUNOSCUT!");
                    if (verificationTimerRef.current !== null) {
                      window.clearTimeout(verificationTimerRef.current);
                    }
                    verificationTimerRef.current = window.setTimeout(() => {
                      if (currentVerificationIndex === ACTIONS.length - 1) {
                        setVerificationComplete(true);
                        setVerificationMessage("✓ EȘTI GATA!");
                      } else {
                        const nextIndex = currentVerificationIndex + 1;
                        verificationIndexRef.current = nextIndex;
                        setVerificationIndex(nextIndex);
                        setVerificationMessage("");
                      }
                      verificationTimerRef.current = null;
                    }, 650);
                  }
                }
              }
            }

            context.clearRect(0, 0, canvas.width, canvas.height);

            for (const landmarks of result.landmarks) {
              drawingUtils.drawConnectors(
                landmarks,
                bodyConnections,
                { color: SKELETON_COLOR, lineWidth: 4 },
              );
              for (const landmark of landmarks.slice(FIRST_BODY_LANDMARK_INDEX)) {
                const x = landmark.x * canvas.width;
                const y = landmark.y * canvas.height;
                context.beginPath(); context.arc(x, y, 4.5, 0, Math.PI * 2);
                context.fillStyle = "#020617"; context.fill();
                context.beginPath(); context.arc(x, y, 2.6, 0, Math.PI * 2);
                context.fillStyle = SKELETON_COLOR; context.fill();
              }
            }

            // Hands are visual-only. Pose recognition and body drawing always finish
            // first, so detailed hand inference can never delay an ActionEvent.
            if (handLandmarker && frameNow - lastHandAt >= HAND_INTERVAL_MS) {
              const handStartedAt = performance.now();
              handResult = handLandmarker.detectForVideo(video, timestamp);
              handTrackingResultRef.current = handResult;
              handTimeTotal += performance.now() - handStartedAt;
              handFrames += 1;
              lastHandAt = frameNow;
            }
            for (const landmarks of handResult?.landmarks ?? []) {
              drawingUtils.drawConnectors(
                landmarks,
                HandLandmarker.HAND_CONNECTIONS,
                { color: HAND_SKELETON_COLOR, lineWidth: 2 },
              );
              for (const landmark of landmarks) {
                const x = landmark.x * canvas.width;
                const y = landmark.y * canvas.height;
                context.beginPath(); context.arc(x, y, 3.6, 0, Math.PI * 2);
                context.fillStyle = "#22051b"; context.fill();
                context.beginPath(); context.arc(x, y, 2.1, 0, Math.PI * 2);
                context.fillStyle = HAND_SKELETON_COLOR; context.fill();
              }
            }

            const metricsElapsed = performance.now() - metricsStartedAt;
            if (metricsElapsed >= 1_000) {
              const seconds = metricsElapsed / 1_000;
              if (screen !== "battle") {
                setPerformanceStats((current) => ({
                  cameraFps: cameraFrames / seconds,
                  poseFps: poseFrames / seconds,
                  poseMs: poseFrames ? poseTimeTotal / poseFrames : 0,
                  handFps: handFrames / seconds,
                  handMs: handFrames ? handTimeTotal / handFrames : 0,
                  debugFps: debugUpdates / seconds,
                  skippedFrames,
                  delegate: current.delegate,
                }));
              }
              metricsStartedAt = performance.now();
              cameraFrames = 0; poseFrames = 0; poseTimeTotal = 0;
              handFrames = 0; handTimeTotal = 0; debugUpdates = 0; skippedFrames = 0;
            }
          } catch (error) {
            console.error("MediaPipe video inference failed.", error);
          } finally {
            isInferenceRunning = false;
          }

          scheduleNextFrame();
        };

        scheduleNextFrame();
      } catch (error) {
        console.error(error);
        handLandmarker?.close();
        handLandmarker = null;
        poseLandmarker?.close();
        poseLandmarker = null;
        handTrackingResultRef.current = null;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        if (videoElement) {
          videoElement.srcObject = null;
        }
        if (!isCancelled) {
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            setCameraError("Camera access is needed to play.");
          } else {
            setPoseStatus("Camera or tracking could not start. Please try again.");
          }
        }
      } finally {
        releaseMediaPipeLogger();
      }
    }

    startPoseTracking();

    return () => {
      isCancelled = true;
      if (trackingSessionRef.current === sessionId) {
        trackingSessionRef.current += 1;
      }
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (videoFrameCallbackId !== null && videoElement) {
        videoElement.cancelVideoFrameCallback(videoFrameCallbackId);
      }
      handLandmarker?.close();
      handLandmarker = null;
      poseLandmarker?.close();
      poseLandmarker = null;
      handTrackingResultRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [playTone, screen, trackingRetryKey, traceEvent]);

  useEffect(() => {
    if (screen !== "battle") return;
    let timerId: number | null = null;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const current = battleStateRef.current;
      if (!current) {
        timerId = window.setTimeout(tick, 100);
        return;
      }
      const update = advanceOpponent(current, performance.now());
      for (const event of update.events) traceEvent(event);
      if (update.state.feedback === "Incoming attack!" && current.feedback !== "Incoming attack!") {
        traceEvent("enemy.telegraph");
      }
      if (update.state !== current) {
        battleStateRef.current = update.state;
        setBattleState(update.state);
      }
      if (update.outcome === "block" || update.outcome === "dodge") {
        setCurrentSession((session) =>
          session
            ? {
                ...session,
                gameplayData: {
                  ...session.gameplayData,
                  successfulBlocks:
                    session.gameplayData.successfulBlocks +
                    (update.outcome === "block" ? 1 : 0),
                  successfulDodges:
                    session.gameplayData.successfulDodges +
                    (update.outcome === "dodge" ? 1 : 0),
                },
              }
            : session,
        );
        playTone(update.outcome === "dodge" ? 620 : 280, 120);
      } else if (update.outcome === "hit") {
        traceEvent("result PLAYER_HIT");
        playTone(130, 160);
      }
      if (update.outcome === "block") traceEvent("result BLOCKED");
      if (update.outcome === "dodge") traceEvent("result DODGED");
      if (update.state.status === "playing") timerId = window.setTimeout(tick, 50);
    };
    timerId = window.setTimeout(tick, 50);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [playTone, screen, traceEvent]);

  useEffect(() => {
    if (
      screen !== "battle" ||
      !battleState ||
      battleState.status === "playing" ||
      roundRecordedRef.current
    ) {
      return;
    }
    roundRecordedRef.current = true;
    const completedState = battleState;
    setCurrentSession((session) =>
      session
        ? {
            ...session,
            gameplayData: {
              ...session.gameplayData,
              battles: [
                ...session.gameplayData.battles,
                {
                  battleNumber: completedState.battleNumber,
                  won: completedState.status === "won",
                  playerHealth: completedState.playerHealth,
                  durationMs: performance.now() - battleStartedAtRef.current,
                },
              ],
            },
          }
        : session,
    );
    playTone(completedState.status === "won" ? 760 : 150, 300);
    roundTransitionTimerRef.current = window.setTimeout(() => {
      setScreen("transition");
      roundTransitionTimerRef.current = null;
    }, 1_000);
  }, [battleState, playTone, screen]);

  useEffect(() => {
    if (screen !== "battle" || !DEVELOPMENT_CONTROLS) return;
    const keyMap: Record<string, ActionLabel | undefined> = {
      a: "ATTACK",
      b: "BLOCK",
      d: "DODGE",
      s: "SPECIAL",
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = keyMap[event.key.toLowerCase()];
      if (!action || event.repeat) return;
      actionEventHandlerRef.current?.({
        action,
        timestampMs: performance.now(),
        source: "keyboard",
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen]);

  useEffect(() => {
    if (
      screen !== "teach" ||
      capturePhase !== "idle" ||
      readyMoveCount !== ACTIONS.length ||
      verificationComplete ||
      !currentSession
    ) {
      return;
    }
    const trainings =
      currentSession.moves as Record<ActionLabel, ActionTraining>;
    const diagnostics = analyzeTrainingSet(trainings);
    const timer = window.setTimeout(() => {
      setTrainingDiagnostics(diagnostics);
      movementRecognizerRef.current ??= new MovementRecognizer(trainings);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    capturePhase,
    currentSession,
    readyMoveCount,
    screen,
    similarityAccepted,
    verificationComplete,
  ]);

  const previewRecording = previewAction
    ? recordings[previewAction]?.demonstrations[0]
    : null;
  const gameplay = currentSession?.gameplayData;
  const actionTotals = ACTIONS.map((action) => ({
    action,
    count: gameplay?.actions.filter((entry) => entry.action === action).length ?? 0,
  }));
  const mostUsedMove = [...actionTotals].sort((a, b) => b.count - a.count)[0];
  const predictionAccuracy =
    gameplay && gameplay.predictions.length > 0
      ? (gameplay.predictions.filter((entry) => entry.correct).length /
          gameplay.predictions.length) *
        100
      : null;
  const favorite = favoriteSequence(
    gameplay?.actions.map((entry) => entry.action) ?? [],
  );

  if (screen === "welcome") {
    return (
      <main className="title-screen flex min-h-screen flex-col items-center justify-center p-8 text-center text-white">
        <p className="mb-4 text-sm font-black tracking-[0.45em] text-cyan-300">YR MOTION // COMBAT PROTOCOL</p>
        <h1 className="title-mark text-6xl font-black">YR MOTION</h1>
        <p className="mt-3 text-xl font-bold tracking-[0.25em] text-slate-200">YOUR BODY IS THE CONTROLLER.</p>
        <p className="mt-8 text-xs font-bold tracking-[0.35em] text-emerald-300">MOTION SYSTEM // ONLINE</p>
        <button
          type="button"
          onClick={startNewPlayer}
          className="game-button mt-10 bg-cyan-400 px-10 py-4 text-lg font-black text-slate-950"
        >
          START NEW GAME
        </button>
        <button type="button" onClick={toggleFullscreen} className="game-button-secondary mt-4 px-5 py-2 text-sm">
          FULLSCREEN
        </button>
      </main>
    );
  }

  if (screen === "nickname") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-white">
        <form
          onSubmit={createPlayerSession}
          className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8"
        >
          <h1 className="text-3xl font-bold">Who&apos;s playing?</h1>
          <label htmlFor="nickname" className="mt-6 block text-slate-300">
            First name or nickname
          </label>
          <input
            id="nickname"
            value={nicknameInput}
            onChange={(event) => setNicknameInput(event.target.value)}
            maxLength={24}
            autoComplete="off"
            autoFocus
            className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-950 px-4 py-3 text-lg outline-none focus:border-cyan-400"
          />
          <button
            type="submit"
            disabled={!nicknameInput.trim()}
            className="mt-6 w-full rounded-lg bg-cyan-500 px-6 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            CONTINUE
          </button>
        </form>
      </main>
    );
  }

  if (screen === "preview" && previewRecording) {
    return (
      <MovePreview recording={previewRecording} onBack={returnToMoveSetup} />
    );
  }

  if (screen === "similarity" && trainingDiagnostics) {
    const pair = trainingDiagnostics.similarPairs[0];
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-white">
        <section className="w-full max-w-xl rounded-2xl border border-amber-700 bg-slate-900 p-8">
          <p className="font-bold tracking-widest text-amber-300">MOVES LOOK SIMILAR</p>
          <h1 className="mt-4 text-3xl font-black">
            {pair.first} and {pair.second} look very similar.
          </h1>
          <p className="mt-3 text-slate-300">Try making them a little more different.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {[pair.first, pair.second].map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setCurrentSession((session) => {
                    if (!session) return session;
                    const moves = { ...session.moves };
                    delete moves[action];
                    return { ...session, moves };
                  });
                  setScreen("teach");
                  nextExampleTimerRef.current = window.setTimeout(() => {
                    startTeaching(action);
                    nextExampleTimerRef.current = null;
                  }, 300);
                }}
                className="rounded-lg bg-cyan-500 px-5 py-3 font-black text-slate-950"
              >
                CHANGE {action}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSimilarityAccepted(true);
              movementRecognizerRef.current?.resetRuntime();
              verificationIndexRef.current = 0;
              setVerificationIndex(0);
              setVerificationMessage("");
              setScreen("verify");
            }}
            className="mt-3 w-full rounded-lg border border-slate-500 px-5 py-3 font-bold"
          >
            KEEP ANYWAY
          </button>
        </section>
      </main>
    );
  }

  if (screen === "verify") {
    const expectedAction = ACTIONS[verificationIndex];
    return (
      <main className="min-h-screen bg-slate-950 p-5 text-white lg:p-8">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-6 lg:grid-cols-[1.6fr_0.9fr]">
          <section>
            <p className="mb-2 text-sm font-bold text-cyan-300">{poseStatus}</p>
            {DEVELOPMENT_CONTROLS && (
              <p className="mb-2 font-mono text-[11px] text-slate-400">
                Camera {performanceStats.cameraFps.toFixed(1)} FPS · Pose {performanceStats.poseFps.toFixed(1)} FPS / {performanceStats.poseMs.toFixed(1)} ms · Hands {performanceStats.handFps.toFixed(1)} FPS / {performanceStats.handMs.toFixed(1)} ms · Debug {performanceStats.debugFps.toFixed(1)} FPS · Skipped {performanceStats.skippedFrames} · {performanceStats.delegate}
              </p>
            )}
            <div className="relative overflow-hidden rounded-2xl border border-cyan-800 bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="block w-full -scale-x-100" />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" aria-hidden="true" />
            </div>
          </section>
          <section className="text-center">
            <p className="font-bold tracking-[0.25em] text-slate-400">QUICK CHECK</p>
            <h1 className="mt-3 text-3xl font-black">
              {verificationComplete ? "✓ EȘTI GATA" : ACTION_GUIDES[expectedAction].title}
            </h1>
            <p className="mt-3 text-lg text-slate-300">
              {verificationComplete
                ? "You know all four controls."
                : ACTION_GUIDES[expectedAction].instruction}
            </p>
            {!verificationComplete && (
              <p className="mt-2 text-sm font-semibold text-cyan-200">{ACTION_GUIDES[expectedAction].hint}</p>
            )}
            <div className="mt-7 min-h-20 rounded-xl border border-slate-700 bg-slate-900 p-5 text-xl font-black text-cyan-300">
              {verificationMessage || (recognitionDebug?.baselineReady ? "AȘTEPT POZA..." : "STAI DREPT...")}
            </div>
            {recognitionDebug && !verificationComplete && (
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-cyan-900 bg-slate-900 p-4 text-left font-mono text-xs text-slate-200">
                <p>SHOULDER WIDTH: {recognitionDebug.shoulderWidth.toFixed(4)}</p>
                <p>RAW GESTURE: {recognitionDebug.rawGesture ?? "NONE"}</p>
                <p>LS/RS VISIBILITY: {recognitionDebug.leftShoulderVisibility.toFixed(2)} / {recognitionDebug.rightShoulderVisibility.toFixed(2)}</p>
                <p>LE/RE VISIBILITY: {recognitionDebug.leftElbowVisibility.toFixed(2)} / {recognitionDebug.rightElbowVisibility.toFixed(2)}</p>
                <p>LW/RW VISIBILITY: {recognitionDebug.leftWristVisibility.toFixed(2)} / {recognitionDebug.rightWristVisibility.toFixed(2)}</p>
                <p>LEFT WRIST VISIBLE: {recognitionDebug.leftWristVisible ? "YES" : "NO"}</p>
                <p>RIGHT WRIST VISIBLE: {recognitionDebug.rightWristVisible ? "YES" : "NO"}</p>
                <p>LEFT ARM UP: {recognitionDebug.leftArmUp ? "YES" : "NO"}</p>
                <p>RIGHT ARM UP: {recognitionDebug.rightArmUp ? "YES" : "NO"}</p>
                <p>LEFT RAISED AMOUNT: {recognitionDebug.leftRaisedAmount.toFixed(2)}</p>
                <p>RIGHT RAISED AMOUNT: {recognitionDebug.rightRaisedAmount.toFixed(2)}</p>
                <p>SPECIAL CONDITION: {recognitionDebug.specialCondition ? "YES" : "NO"}</p>
                <p>LEFT WRIST RAISED FOR BLOCK: {recognitionDebug.leftWristRaisedForBlock ? "YES" : "NO"}</p>
                <p>RIGHT WRIST RAISED FOR BLOCK: {recognitionDebug.rightWristRaisedForBlock ? "YES" : "NO"}</p>
                <p>LEFT ELBOW RAISED: {recognitionDebug.leftElbowRaised ? "YES" : "NO"}</p>
                <p>RIGHT ELBOW RAISED: {recognitionDebug.rightElbowRaised ? "YES" : "NO"}</p>
                <p>LEFT FOREARM INWARD: {recognitionDebug.leftForearmInward ? "YES" : "NO"}</p>
                <p>RIGHT FOREARM INWARD: {recognitionDebug.rightForearmInward ? "YES" : "NO"}</p>
                <p>TRUE CROSS: {recognitionDebug.trueCross ? "YES" : "NO"}</p>
                <p>STRONG CROSS: {recognitionDebug.strongCross ? "YES" : "NO"}</p>
                <p>LEFT WRIST CHEST Y: {recognitionDebug.leftWristChestY.toFixed(2)}</p>
                <p>RIGHT WRIST CHEST Y: {recognitionDebug.rightWristChestY.toFixed(2)}</p>
                <p>WRIST DISTANCE: {recognitionDebug.wristDistance.toFixed(2)}</p>
                <p>DISTANCE FROM NEUTRAL LEFT ARM: {recognitionDebug.leftArmDistanceFromNeutral.toFixed(2)}</p>
                <p>DISTANCE FROM NEUTRAL RIGHT ARM: {recognitionDebug.rightArmDistanceFromNeutral.toFixed(2)}</p>
                <p>BLOCK CONDITION: {recognitionDebug.blockCondition ? "YES" : "NO"}</p>
                <p>VERTICAL DROP: {recognitionDebug.verticalDrop.toFixed(2)}</p>
                <p>NEUTRAL SHOULDER CENTER Y: {recognitionDebug.neutralShoulderCenterY.toFixed(3)}</p>
                <p>CURRENT SHOULDER CENTER Y: {recognitionDebug.currentShoulderCenterY.toFixed(3)}</p>
                <p>VERTICAL SHOULDER DROP: {recognitionDebug.verticalShoulderDrop.toFixed(2)}</p>
                <p>NEUTRAL NOSE Y: {recognitionDebug.neutralNoseY.toFixed(3)}</p>
                <p>CURRENT NOSE Y: {recognitionDebug.currentNoseY.toFixed(3)}</p>
                <p>LATERAL SHIFT: {recognitionDebug.lateralShift.toFixed(2)}</p>
                <p>SHOULDER TILT: {recognitionDebug.shoulderTilt.toFixed(2)}</p>
                <p>DODGE CONDITION: {recognitionDebug.dodgeCondition ? "YES" : "NO"}</p>
                <p>LEFT EXTENSION: {recognitionDebug.leftExtension.toFixed(2)}</p>
                <p>RIGHT EXTENSION: {recognitionDebug.rightExtension.toFixed(2)}</p>
                <p>RIGHT SHOULDER x/y: {recognitionDebug.rightShoulderX.toFixed(3)} / {recognitionDebug.rightShoulderY.toFixed(3)}</p>
                <p>RIGHT ELBOW x/y: {recognitionDebug.rightElbowX.toFixed(3)} / {recognitionDebug.rightElbowY.toFixed(3)}</p>
                <p>RIGHT WRIST x/y: {recognitionDebug.rightWristX.toFixed(3)} / {recognitionDebug.rightWristY.toFixed(3)}</p>
                <p>RIGHT HORIZONTAL EXTENSION: {recognitionDebug.rightHorizontalExtension.toFixed(2)}</p>
                <p>RIGHT VERTICAL OFFSET: {recognitionDebug.rightVerticalOffset.toFixed(2)}</p>
                <p>RIGHT ELBOW HORIZONTAL EXTENSION: {recognitionDebug.rightElbowHorizontalExtension.toFixed(2)}</p>
                <p>ATTACK ANGLE: {recognitionDebug.attackAngle.toFixed(1)}°</p>
                <p>RIGHT ARM SIDEWAYS: {recognitionDebug.rightArmSideways ? "YES" : "NO"}</p>
                <p>ATTACK CONDITION: {recognitionDebug.attackCondition ? "YES" : "NO"}</p>
                <p className="font-black text-cyan-300">RAW GESTURE: {recognitionDebug.rawGesture ?? "NONE"}</p>
              </div>
            )}
            {DEVELOPMENT_CONTROLS && trainingDiagnostics && (
              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900 p-3 text-left text-xs text-slate-300">
                <p className="font-bold text-cyan-300">Training self-check</p>
                {ACTIONS.map((action) => {
                  const diagnostic = trainingDiagnostics.actions[action];
                  return (
                    <p key={action} className="mt-1">
                      {action}: {diagnostic.leaveOneOutCorrect}/{diagnostic.leaveOneOutTotal} · self {Math.round(diagnostic.selfSimilarity)}% · closest {diagnostic.closestAction} · {diagnostic.separation}
                    </p>
                  );
                })}
                {!verificationComplete && (
                  <p className="mt-2 text-slate-400">
                    Live: {ACTIONS.map((action) => `${action} ${Math.round(recognitionScores[action])}`).join(" · ")}
                  </p>
                )}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              {verificationComplete && (
                <button type="button" onClick={() => startBattle(1)} className="rounded-lg bg-cyan-500 px-7 py-3 font-black text-slate-950">
                  START BATTLE
                </button>
              )}
              <button type="button" onClick={() => startBattle(1)} className="rounded-lg border border-slate-500 px-6 py-3 font-bold">
                SKIP TUTORIAL
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (screen === "test") {
    return (
      <main className="min-h-screen bg-slate-950 p-5 text-white lg:p-8">
        <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">TEST MY MOVES</h1>
            <p className="text-slate-300">
              Try any of your four moves, in any order.
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={toggleSound} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">{isMuted ? "SOUND OFF" : "SOUND ON"}</button>
            <button type="button" onClick={toggleFullscreen} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">FULLSCREEN</button>
            <button type="button" onClick={returnToMoveSetup} className="rounded-lg border border-slate-600 px-4 py-2">BACK TO MOVES</button>
          </div>
        </header>

        <div className="mx-auto mt-5 grid w-full max-w-7xl items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(330px,1fr)]">
          <section>
            <p className="mb-2 text-sm text-cyan-300" role="status">
              {poseStatus}
            </p>
            <div className="relative w-full overflow-hidden rounded-2xl border border-slate-700 bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="block h-auto w-full -scale-x-100"
              />
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
                aria-hidden="true"
              />
            </div>
            {cameraError && (
              <div className="mt-3 flex items-center gap-3 text-red-400">
                <p>{cameraError}</p>
                <button type="button" onClick={() => setTrackingRetryKey((value) => value + 1)} className="rounded border border-red-500 px-3 py-1 text-sm">TRY AGAIN</button>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-2xl font-bold">YOUR MOVE</h2>
            <p className="mt-1 text-xs text-slate-400">
              Move freely — the game is listening.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {ACTIONS.map((action) => (
                <div
                  key={action}
                  className={`rounded-lg border p-2 transition-colors ${
                    flashedAction === action
                      ? "border-emerald-300 bg-emerald-900"
                      : "border-slate-700 bg-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{action}</span>
                    {DEVELOPMENT_CONTROLS && <span className="font-mono text-xs text-cyan-300">{recognitionScores[action].toFixed(0)}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Emitted: {detectionCounts[action]}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-cyan-800 bg-slate-950 p-5 text-center">
              <p className="text-sm text-slate-400">Detected</p>
              <p className="mt-1 text-6xl font-black italic text-cyan-300">
                {detectedAction ?? "NONE"}
              </p>
              <p className="mt-3 text-sm text-slate-400">
                Recognition latency: {recognitionLatency === null ? "—" : `${Math.round(recognitionLatency)} ms`}
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => startBattle(1)} className="flex-1 rounded-lg bg-emerald-500 px-4 py-3 font-black text-slate-950">
                START BATTLE
              </button>
              {DEVELOPMENT_CONTROLS && <button type="button" onClick={startQuickCheck} className="rounded-lg border border-slate-600 px-3 py-2 text-xs">QUICK CHECK</button>}
            </div>
            {DEVELOPMENT_CONTROLS && (
              <div className="mt-4 border-t border-slate-700 pt-4 text-xs text-slate-300">
                <p className="font-bold text-cyan-300">I AM ABOUT TO DO</p>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => {
                        setExpectedDebugAction(action);
                        expectedDebugActionRef.current = action;
                        setActionTrace(`Waiting for ${action}...`);
                      }}
                      className={`rounded border px-1 py-2 text-[10px] font-bold ${expectedDebugAction === action ? "border-cyan-300 bg-cyan-950" : "border-slate-600"}`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
                {recognitionDebug && (
                  <div className="mt-3 space-y-1 font-mono">
                    <p>Active frames: {recognitionDebug.activeFrames} · onset: {recognitionDebug.onsetDetected ? "yes" : "no"}</p>
                    <p>Best: {recognitionDebug.bestAction ?? "NONE"} · runner-up: {recognitionDebug.runnerUp ?? "NONE"}</p>
                    <p>Distances: {ACTIONS.map((action) => `${action} ${Number.isFinite(recognitionDebug.distances[action]) ? recognitionDebug.distances[action].toFixed(2) : "∞"}`).join(" · ")}</p>
                    <p>Margin: {recognitionDebug.margin.toFixed(2)} · decision: {recognitionDebug.decision}</p>
                    <p>Reason: {recognitionDebug.reason}</p>
                    <p>State: {recognitionDebug.state} · energy {recognitionDebug.movementEnergy.toFixed(3)} · ready {recognitionDebug.readyForNext ? "yes" : "no"}</p>
                    <p>Pose: {recognitionDebug.usablePose ? "yes" : "no"} · hands L/R: {recognitionDebug.leftHandAvailable ? "yes" : "no"}/{recognitionDebug.rightHandAvailable ? "yes" : "no"}</p>
                    {actionTrace && <p className="text-cyan-300">{actionTrace}</p>}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  if (screen === "battle" && battleState) {
    const opponent = OPPONENTS[battleState.battleNumber - 1];
    const playerHealthPercent =
      (battleState.playerHealth / COMBAT_CONFIG.playerMaxHealth) * 100;
    const opponentHealthPercent =
      (battleState.opponentHealth /
        COMBAT_CONFIG.opponentHealth[battleState.battleNumber - 1]) *
      100;
    const enemyProjectile = battleState.projectiles.find((projectile) => projectile.owner === "ENEMY");
    const reflectedProjectile = battleState.projectiles.find((projectile) => projectile.owner === "PLAYER" && projectile.reflected);
    return (
      <main className="min-h-screen overflow-hidden bg-slate-950 p-4 text-white lg:p-6">
        <header className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-widest text-cyan-300">
              BATTLE {battleState.battleNumber} / 4
            </p>
            <h1 className="text-2xl font-black lg:text-3xl">
              {currentSession?.player.nickname} VS {opponent.name}
            </h1>
            <p className="text-sm text-slate-400">{opponent.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={toggleSound} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">
              {isMuted ? "SOUND OFF" : "SOUND ON"}
            </button>
            <button type="button" onClick={toggleFullscreen} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">
              FULLSCREEN
            </button>
          </div>
        </header>

        <div className="mx-auto mt-4 grid max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_290px]">
          <section className={`battle-cabinet ${battleState.feedback === "HIT!" ? battleState.impactKind === "SPECIAL" ? "arena-shake-strong" : "arena-shake" : ""} ${battleState.playerAnimation === "SPECIAL" ? "special-camera" : ""}`}>
            <div className="battle-hud grid grid-cols-2 gap-5">
              <HealthBar label={currentSession?.player.nickname ?? "PLAYER"} value={playerHealthPercent} />
              <HealthBar label={opponent.name} value={opponentHealthPercent} align="right" />
            </div>

            <div className={`battle-arena arena-${battleState.battleNumber} ${battleState.playerAnimation === "SPECIAL" ? "arena-special-light" : ""} relative mt-3 flex min-h-[430px] items-end justify-around overflow-hidden px-6 pb-14`}>
              <div className="arena-moon" />
              <div className="arena-depth-far" />
              <div className="arena-rigging"><i/><i/><i/></div>
              <div className="arena-crowd"><i/><i/><i/><i/><i/><i/></div>
              <div className="arena-skyline" />
              <div className="arena-haze arena-haze-back" />
              <div className="arena-lights"><i /><i /><i /><i /><i /></div>
              <div className="arena-banners"><i>YR</i><i>MOTION</i></div>
              <div className="arena-dust" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/><i/></div>
              <div className="arena-platform" />
              <div className="arena-floor-sheen" />
              <div className="arena-foreground" />
              <div className="arena-vignette" />
              <div key={`round-${battleState.battleNumber}`} className="round-intro" aria-hidden="true"><span>ROUND {battleState.battleNumber}</span><b>FIGHT</b></div>
              {battleState.opponentAttackAt !== null && <div className={`enemy-charge enemy-charge-${battleState.battleNumber}`} />}
              {enemyProjectile && (
                <div
                  key={`projectile-${enemyProjectile.id}`}
                  className={`enemy-projectile projectile-${battleState.battleNumber}`}
                  style={{ animationDuration: `${enemyProjectile.impactAt - enemyProjectile.spawnedAt}ms` }}
                >
                  <span /><i/><b/>
                </div>
              )}
              {(battleState.opponentAnimation === "HIT" || battleState.playerAnimation === "HIT") && (
                <div key={`impact-${battleState.animationVersion}`} className={`impact-burst impact-${(battleState.impactKind ?? "NORMAL").toLowerCase()} ${battleState.opponentAnimation === "HIT" ? "impact-right" : "impact-left"}`}><i/><i/><i/><i/><i/></div>
              )}
              {(battleState.playerAnimation === "ATTACK" || battleState.playerAnimation === "SPECIAL") && (
                <div key={`player-power-${battleState.animationVersion}`} className={`player-power player-power-${battleState.playerAnimation.toLowerCase()}`}><i/><i/><i/></div>
              )}
              {playerProjectile && (
                <div key={playerProjectile.id} className={`player-projectile ${playerProjectile.special ? "player-projectile-special" : ""}`}>
                  <i /><b /><span/><span/><span/><span/>
                </div>
              )}
              {reflectedProjectile && <div key={`${reflectedProjectile.id}-${reflectedProjectile.status}`} className={`reflected-projectile ${reflectedProjectile.status === "SHIELD_CONTACT" ? "reflected-projectile-contact" : "reflected-projectile-travel"}`}><i/><b/><span/><span/><span/></div>}
              {reflectedProjectile?.status === "SHIELD_CONTACT" && <div className="block-contact-flash"><i/></div>}
              {(battleState.opponentAnimation === "DODGE" || battleState.playerAnimation === "DODGE") && <div className={`combat-dust ${battleState.opponentAnimation === "DODGE" ? "combat-dust-right" : "combat-dust-left"}`}><i/><i/><i/><i/></div>}
              {battleState.status !== "playing" && <div className={`finish-dust ${battleState.status === "won" ? "finish-dust-right" : "finish-dust-left"}`}><i/><i/><i/><i/><i/></div>}
              <Fighter key={`player-${battleState.animationVersion}`} name={currentSession?.player.nickname ?? "PLAYER"} side="player" animation={battleState.playerAnimation} combatFeedback={battleState.feedback} />
              <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center">
                {visibleActionLabel && <p key={`callout-${battleState.animationVersion}`} className="recognized-callout">{visibleActionLabel}!</p>}
                <p className="combat-feedback">{battleState.feedback}</p>
                {battleState.opponentAttackAt !== null && (
                  <p className="mt-2 animate-pulse font-bold text-red-400">INCOMING ATTACK — BLOCK OR DODGE!</p>
                )}
              </div>
              {battleState.battleNumber === 4 && (gameplay?.actions.length ?? 0) >= 8 && livePrediction && livePrediction.confidence >= 0.36 && (
                <p className="analysis-tag">{livePrediction.confidence >= 0.48 ? "PATTERN FOUND" : "ANALYZING..."}</p>
              )}
              <Fighter key={`opponent-${battleState.animationVersion}`} name={opponent.name} side="opponent" animation={battleState.opponentAnimation} opponentNumber={battleState.battleNumber} />
            </div>

            <div className={`special-meter mt-4 ${specialNotReady ? "special-meter-not-ready" : ""}`}>
              <div className="flex items-center justify-between text-sm font-bold">
                <span>SPECIAL ENERGY</span>
                <span className={battleState.specialEnergy >= 100 ? "animate-pulse text-amber-300" : "text-cyan-300"}>
                  {battleState.specialEnergy >= 100 ? "SPECIAL READY!" : `${battleState.specialEnergy}%`}
                </span>
              </div>
              <div className="special-meter-track mt-2 h-4 overflow-hidden rounded-full bg-slate-800">
                <div className="special-meter-fill h-full bg-amber-400 transition-[width] duration-200" style={{ width: `${battleState.specialEnergy}%` }} />
              </div>
              {specialNotReady && <p className="special-not-ready-text">SPECIAL NOT READY</p>}
            </div>
          </section>

          <aside className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-slate-700 bg-black">
              <div className="relative">
                <video ref={videoRef} autoPlay playsInline muted className="block w-full -scale-x-100" />
                <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" aria-hidden="true" />
              </div>
              <p className="bg-slate-900 px-3 py-2 text-center text-xs font-bold text-cyan-300">TRACKING: {trackingQuality}</p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-center">
              <p className="text-xs text-slate-400">YOUR LAST MOVE</p>
              <p className="mt-1 text-2xl font-black text-cyan-300">{visibleActionLabel ?? "MOVE!"}</p>
            </div>
            {battleState.battleNumber >= 3 && livePrediction && (
              <div className="rounded-xl border border-slate-700 bg-slate-900 p-3">
                <p className="text-xs font-bold text-slate-400">THE AI IS LEARNING</p>
                {ACTIONS.map((action) => (
                  <div key={action} className="mt-1 flex justify-between text-xs">
                    <span>{action}</span>
                    <span>{Math.round(livePrediction.probabilities[action] * 100)}%</span>
                  </div>
                ))}
              </div>
            )}
            {DEVELOPMENT_CONTROLS && (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">
                <p className="text-center">Dev keys: A attack · B block · D dodge · S special</p>
                <div className="mt-2 space-y-1 font-mono text-[10px]">
                  <p>RAW DETECTED GESTURE: {battleGestureDebug.raw ?? "NONE"}</p>
                  <p>ACTION EVENT EMITTED: {battleGestureDebug.emitted ?? "NONE"}</p>
                  <p>ACTION EVENT ACCEPTED: {battleGestureDebug.accepted ? "YES" : "NO"}</p>
                  <p>CURRENT CHARACTER ACTION: {battleState.playerAnimation}</p>
                  <p>VISIBLE ACTION LABEL: {visibleActionLabel ?? "NONE"}</p>
                </div>
                {recognitionDebug && (
                  <p className="mt-2 text-center font-mono">
                    {recognitionDebug.decision} · {recognitionDebug.reason} · {actionTrace}
                  </p>
                )}
                {combatSelfTest && (
                  <p className="mt-2 text-center font-mono text-emerald-400">
                    Combat self-test: {combatSelfTest.passed ? "PASS" : "FAIL"}
                  </p>
                )}
                {eventLog.length > 0 && (
                  <div className="mt-2 max-h-24 overflow-hidden font-mono text-[10px] text-slate-400">
                    {eventLog.map((entry) => <div key={entry}>{entry}</div>)}
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </main>
    );
  }

  if (screen === "transition" && battleState) {
    const isFinal = battleState.battleNumber === 4;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-8 text-center text-white">
        <p className="font-bold tracking-widest text-cyan-300">BATTLE {battleState.battleNumber} COMPLETE</p>
        <h1 className="mt-3 text-5xl font-black">{battleState.status === "won" ? "OPPONENT DEFEATED!" : "GOOD TRY!"}</h1>
        <p className="mt-3 text-lg text-slate-300">
          {battleState.status === "won" ? "Your moves were stronger." : "Every battle teaches the AI more."}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={() => startBattle(battleState.battleNumber)} className="rounded-xl border border-slate-500 px-6 py-3 font-bold">RETRY</button>
          <button
            type="button"
            onClick={() => (isFinal ? setScreen("results") : startBattle(battleState.battleNumber + 1))}
            className="rounded-xl bg-cyan-500 px-8 py-3 font-black text-slate-950"
          >
            {isFinal ? "SEE RESULTS" : "NEXT BATTLE"}
          </button>
        </div>
      </main>
    );
  }

  if (screen === "results" && currentSession && gameplay) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
        <section className="w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-6 lg:p-9">
          <p className="font-bold tracking-widest text-cyan-300">SESSION COMPLETE</p>
          <h1 className="mt-2 text-4xl font-black lg:text-5xl">WHAT THE AI LEARNED ABOUT {currentSession.player.nickname.toUpperCase()}</h1>
          <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ResultStat label="Actions observed" value={String(gameplay.actions.length)} />
            <ResultStat label="Most used move" value={mostUsedMove && mostUsedMove.count > 0 ? mostUsedMove.action : "Not enough data"} />
            <ResultStat label="Favorite sequence" value={favorite ? favorite[0] : "Not enough data"} />
            <ResultStat label="AI prediction accuracy" value={predictionAccuracy === null ? "Not enough data" : `${Math.round(predictionAccuracy)}%`} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-950 p-5">
              <h2 className="font-black text-slate-400">AT THE START</h2>
              <p className="mt-2 text-lg">The opponent did not know your playstyle.</p>
            </div>
            <div className="rounded-xl border border-cyan-800 bg-slate-950 p-5">
              <h2 className="font-black text-cyan-300">BY THE FINAL BATTLE</h2>
              <p className="mt-2 text-lg">It used your action patterns to anticipate what you might do next.</p>
            </div>
          </div>
          <p className="mt-5 text-center text-sm text-slate-400">
            Successful attacks: {gameplay.successfulAttacks} · blocks: {gameplay.successfulBlocks} · dodges: {gameplay.successfulDodges} · specials: {gameplay.successfulSpecials}
          </p>
          <button type="button" onClick={resetToHome} className="mt-7 w-full rounded-xl bg-cyan-500 px-8 py-4 text-xl font-black text-slate-950">NEXT PLAYER</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 p-5 text-white lg:p-8">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">YR Motion Game</h1>
          <p className="text-slate-300">
            {currentSession?.player.nickname}, teach us your moves.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={toggleSound} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">{isMuted ? "SOUND OFF" : "SOUND ON"}</button>
          <button type="button" onClick={toggleFullscreen} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">FULLSCREEN</button>
          <button type="button" onClick={resetToHome} className="rounded-lg border border-slate-600 px-4 py-2 text-sm">New Player</button>
        </div>
      </header>

      <div className="mx-auto mt-5 grid w-full max-w-7xl items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(330px,1fr)]">
        <section>
          <p className="mb-2 text-sm text-cyan-300" role="status">
            {poseStatus}
          </p>
          <div className="relative w-full overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="block h-auto w-full -scale-x-100"
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
              aria-hidden="true"
            />

            {capturePhase !== "idle" && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45 text-center">
                {capturePhase === "countdown" ? (
                  <div>
                    <p className="text-2xl font-bold">
                      Teach your {selectedAction}
                    </p>
                    <p className="mt-1 text-lg">
                    Example {teachingExample} of 1
                    </p>
                    <p className="mt-2 text-xl">Get ready...</p>
                    <p className="mt-2 text-7xl font-black text-amber-300">
                      {countdown}
                    </p>
                  </div>
                ) : capturePhase === "recording" ? (
                  <div>
                    <p className="text-7xl font-black text-red-400">MOVE!</p>
                    <p className="mt-3 text-2xl font-bold">
                      Recording {selectedAction} — Example {teachingExample} of 1
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className={`font-black ${recordingIssue ? "text-4xl text-amber-300" : "text-7xl text-emerald-400"}`}>
                      {recordingIssue || "✓"}
                    </p>
                    {!recordingIssue && (
                      <p className="mt-3 text-2xl font-bold">
                        Example {teachingExample} complete
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {cameraError && (
            <div className="mt-3 flex items-center gap-3 text-red-400">
              <p>{cameraError}</p>
              <button type="button" onClick={() => setTrackingRetryKey((value) => value + 1)} className="rounded border border-red-500 px-3 py-1 text-sm">TRY AGAIN</button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h2 className="text-2xl font-bold">YOUR MOVES</h2>
          <p className="mt-1 font-semibold text-cyan-300">
            {readyMoveCount} / 4 MOVES READY
          </p>
          {DEVELOPMENT_CONTROLS && !similarityAccepted && trainingDiagnostics?.similarPairs[0] && (
            <div className="mt-3 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-xs text-amber-200">
              <p className="font-bold">
                {trainingDiagnostics.similarPairs[0].first} and{" "}
                {trainingDiagnostics.similarPairs[0].second} may be hard to tell apart.
              </p>
              <div className="mt-2 flex gap-2">
                {[trainingDiagnostics.similarPairs[0].first, trainingDiagnostics.similarPairs[0].second].map((action) => (
                  <button key={action} type="button" onClick={() => startTeaching(action)} className="rounded border border-amber-500 px-2 py-1 font-bold">
                    CHANGE {action}
                  </button>
                ))}
                <button type="button" onClick={() => setSimilarityAccepted(true)} className="rounded border border-slate-500 px-2 py-1 font-bold">
                  KEEP ANYWAY
                </button>
              </div>
            </div>
          )}
          <div className="mt-4 space-y-3">
            {ACTIONS.map((action) => {
              const recording = recordings[action];
              return (
                <article
                  key={action}
                  className="rounded-xl border border-slate-700 bg-slate-800 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-bold">{action}</h3>
                      <p
                        className={
                          recording ? "text-emerald-400" : "text-slate-400"
                        }
                      >
                        {recording ? "✓ Learned" : "Not learned"}
                      </p>
                    </div>

                    {recording ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewAction(action);
                            setScreen("preview");
                          }}
                          disabled={capturePhase !== "idle"}
                          className="rounded-md border border-slate-500 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          VIEW
                        </button>
                        <button
                          type="button"
                          onClick={() => startTeaching(action)}
                          disabled={capturePhase !== "idle"}
                          className="rounded-md bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                        >
                          CHANGE
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startTeaching(action)}
                        disabled={capturePhase !== "idle"}
                        className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
                      >
                        TEACH
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <button
            type="button"
            onClick={startTestMode}
            disabled={readyMoveCount !== ACTIONS.length}
            className="mt-5 w-full rounded-lg bg-cyan-500 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            TEST MY MOVES
          </button>
          <button
            type="button"
            onClick={startQuickCheck}
            disabled={readyMoveCount !== ACTIONS.length}
            className="mt-2 w-full rounded-lg border border-cyan-700 px-5 py-2 text-sm font-bold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            QUICK CHECK (OPTIONAL)
          </button>
          <button
            type="button"
            onClick={() => startBattle(1)}
            disabled={readyMoveCount !== ACTIONS.length}
            className="mt-2 w-full rounded-lg bg-emerald-500 px-5 py-3 font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            START BATTLE
          </button>
          <button
            type="button"
            onClick={resetRecordings}
            disabled={
              capturePhase !== "idle" || Object.keys(recordings).length === 0
            }
            className="mt-2 w-full rounded-lg border border-slate-600 px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset Moves
          </button>
        </section>
      </div>
    </main>
  );
}
