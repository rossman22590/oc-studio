"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Phone, Volume2, Users } from "lucide-react";

/* ─── Types ─── */
type VoiceChatWidgetProps = {
  shareToken: string | null;
  userId: string;
  enabled?: boolean;
};

type RoomApiResponse = {
  roomUrl?: string;
  roomName?: string;
  meetingToken?: string;
  error?: string;
};

type DailyParticipant = {
  user_name?: string;
  local?: boolean;
  audio?: boolean;
  session_id?: string;
};

type DailyEvent = {
  participant?: DailyParticipant;
  action?: string;
  errorMsg?: string;
};

type DailyCallObject = {
  join: (opts: { url: string; token?: string; userName?: string; startVideoOff?: boolean; startAudioOff?: boolean }) => Promise<void>;
  leave: () => Promise<void>;
  destroy: () => Promise<void>;
  setLocalAudio: (enabled: boolean) => void;
  setLocalVideo: (enabled: boolean) => void;
  participants: () => Record<string, DailyParticipant & { audioTrack?: MediaStreamTrack; videoTrack?: MediaStreamTrack }>;
  on: (event: string, cb: (evt?: DailyEvent) => void) => DailyCallObject;
  off: (event: string, cb: (evt?: DailyEvent) => void) => DailyCallObject;
  meetingState: () => string;
  localAudio: () => boolean;
  localVideo: () => boolean;
  getRemoteAudioTrack: (sessionId: string) => MediaStreamTrack | null;
};

type DailyFrame = {
  join: (opts: { url: string; token?: string; userName?: string; startVideoOff?: boolean; startAudioOff?: boolean }) => Promise<void>;
  leave: () => Promise<void>;
  destroy: () => Promise<void>;
  setLocalAudio: (enabled: boolean) => void;
  setLocalVideo: (enabled: boolean) => void;
  participants: () => Record<string, DailyParticipant>;
  on: (event: string, cb: (evt?: DailyEvent) => void) => DailyFrame;
  off: (event: string, cb: (evt?: DailyEvent) => void) => DailyFrame;
  meetingState: () => string;
  localAudio: () => boolean;
  localVideo: () => boolean;
};

type DailyModule = {
  default: {
    createCallObject: (options?: { 
      audioSource?: boolean;
      videoSource?: boolean;
      subscribeToTracksAutomatically?: boolean;
    }) => DailyCallObject;
  };
};

/* ─── Component ─── */
export const VoiceChatWidget = ({
  shareToken,
  userId,
  enabled = true,
}: VoiceChatWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const callObjectRef = useRef<DailyCallObject | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const mountedRef = useRef(true);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Count participants helper
  const updateParticipantCount = useCallback(() => {
    if (!callObjectRef.current) {
      setParticipantCount(0);
      return;
    }
    const participants = callObjectRef.current.participants();
    setParticipantCount(Object.keys(participants).length);
  }, []);

  // Clean up call on unmount or when disabled
  useEffect(() => {
    return () => {
      if (callObjectRef.current) {
        void callObjectRef.current.leave().catch(() => {});
        void callObjectRef.current.destroy().catch(() => {});
        callObjectRef.current = null;
      }
      // Clean up all audio elements
      for (const [participantId, audioEl] of audioElementsRef.current) {
        audioEl.pause();
        audioEl.srcObject = null;
        if (audioEl.parentNode) {
          audioEl.parentNode.removeChild(audioEl);
        }
      }
      audioElementsRef.current.clear();
    };
  }, []);

  // Join voice chat
  const handleJoin = useCallback(async () => {
    if (!shareToken || !enabled || isJoining || isJoined) return;

    setIsJoining(true);
    setError(null);

    try {
      // 1. Create/get room from our API
      const res = await fetch("/api/office/daily-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: shareToken }),
      });

      if (!res.ok) {
        const errData = (await res.json()) as RoomApiResponse;
        throw new Error(errData.error || "Failed to create room");
      }

      const roomData = (await res.json()) as RoomApiResponse;
      if (!roomData.roomUrl || !roomData.meetingToken) {
        throw new Error("Invalid room response");
      }

      // 2. Dynamically import Daily SDK (client-side only)
      const DailyIframe = (await import("@daily-co/daily-js")) as unknown as DailyModule;
      
      // Create call object with audio-only settings per Daily.co docs:
      // https://docs.daily.co/guides/products/audio-only
      const callObject = DailyIframe.default.createCallObject({
        audioSource: true, // Start with audio on to get mic permission at start
        videoSource: false, // Turn off cameras for audio-only
        subscribeToTracksAutomatically: true, // For 2 participants, auto-subscribe is fine
      });
      callObjectRef.current = callObject;

      // 3. Set up event listeners
      const handleJoinedMeeting = () => {
        if (!mountedRef.current || !callObjectRef.current) return;
        setIsJoined(true);
        setIsJoining(false);
        updateParticipantCount();
        
        // Ensure audio is enabled after joining
        try {
          callObjectRef.current.setLocalAudio(true);
          callObjectRef.current.setLocalVideo(false);
          setIsMuted(false);
          
          // Verify audio state after a short delay
          setTimeout(() => {
            if (callObjectRef.current && mountedRef.current) {
              const audioEnabled = callObjectRef.current.localAudio();
              const videoEnabled = callObjectRef.current.localVideo();
              console.log("[Voice] Audio state after join:", {
                audio: audioEnabled,
                video: videoEnabled,
                participants: callObjectRef.current.participants(),
              });
              setIsMuted(!audioEnabled);
            }
          }, 500);
        } catch (err) {
          console.warn("[Voice] Failed to enable audio:", err);
        }
        
        console.log("[Voice] Joined Daily room");
      };

      const handleLeftMeeting = () => {
        if (!mountedRef.current) return;
        setIsJoined(false);
        setIsMuted(false);
        setParticipantCount(0);
        console.log("[Voice] Left Daily room");
      };

      const handleParticipantJoined = () => {
        if (mountedRef.current) {
          updateParticipantCount();
          // When a participant joins, check for their audio track after a short delay
          setTimeout(() => {
            if (!callObjectRef.current || !mountedRef.current) return;
            const participants = callObjectRef.current.participants();
            for (const [participantId, participant] of Object.entries(participants)) {
              if (participant.local) continue;
              if (audioElementsRef.current.has(participantId)) continue;
              
              // Try to get audio track
              let audioTrack: MediaStreamTrack | null = null;
              if (typeof callObjectRef.current.getRemoteAudioTrack === "function") {
                audioTrack = callObjectRef.current.getRemoteAudioTrack(participantId);
              } else if (participant.audioTrack) {
                audioTrack = participant.audioTrack;
              }
              
              if (audioTrack) {
                const audioEl = document.createElement("audio");
                audioEl.autoplay = true;
                audioEl.style.display = "none";
                document.body.appendChild(audioEl);
                const stream = new MediaStream([audioTrack]);
                audioEl.srcObject = stream;
                audioEl.play().catch(console.error);
                audioElementsRef.current.set(participantId, audioEl);
                console.log("[Voice] Attached audio for participant on join:", participantId);
              }
            }
          }, 500);
        }
      };

      const handleParticipantLeft = () => {
        if (mountedRef.current) updateParticipantCount();
      };

      const handleParticipantUpdated = (evt?: DailyEvent) => {
        // Track when remote participants' audio state changes
        if (mountedRef.current && callObjectRef.current) {
          console.log("[Voice] Participant updated:", evt);
          updateParticipantCount();
        }
      };

      const handleError = (evt?: DailyEvent) => {
        console.error("[Voice] Daily error:", evt?.errorMsg);
        if (mountedRef.current) {
          setError(evt?.errorMsg || "Voice chat error");
          setIsJoining(false);
        }
      };

      // Audio track events - these fire for both local and remote tracks
      // Per Daily.co docs: decouple audio elements from visual components
      // With subscribeToTracksAutomatically: true, Daily handles track subscription
      // but we need to create audio elements to play remote audio
      const handleTrackStarted = async (evt?: DailyEvent & { 
        participant?: DailyParticipant & { session_id?: string };
        track?: MediaStreamTrack;
        type?: string;
      }) => {
        console.log("[Voice] Track started:", evt);
        if (!mountedRef.current || !callObjectRef.current) return;

        // Check if this is a local audio track
        const audioEnabled = callObjectRef.current.localAudio();
        setIsMuted(!audioEnabled);

        // Handle remote audio tracks - create audio elements per Daily.co best practices
        // https://docs.daily.co/guides/products/audio-only
        if (evt?.participant && !evt.participant.local) {
          const participantId = evt.participant.session_id;
          if (!participantId) return;

          try {
            // Wait a bit for the track to be available, then get it from the participant
            setTimeout(() => {
              if (!mountedRef.current || !callObjectRef.current) return;

              // Try to get the remote audio track using Daily.co API
              let audioTrack: MediaStreamTrack | null = null;
              
              // Method 1: Try getRemoteAudioTrack if available
              if (typeof callObjectRef.current.getRemoteAudioTrack === "function") {
                audioTrack = callObjectRef.current.getRemoteAudioTrack(participantId);
              }
              
              // Method 2: Get from participant object
              if (!audioTrack) {
                const participants = callObjectRef.current.participants();
                const participant = participants[participantId];
                audioTrack = participant?.audioTrack || null;
              }
              
              // Method 3: Use track from event if available
              if (!audioTrack && evt.track && evt.type === "audio") {
                audioTrack = evt.track;
              }

              if (audioTrack && !audioElementsRef.current.has(participantId)) {
                // Create audio element for remote participant (decoupled from UI)
                const audioEl = document.createElement("audio");
                audioEl.autoplay = true;
                audioEl.style.display = "none"; // Hidden, decoupled from visual components
                document.body.appendChild(audioEl);
                
                // Attach the MediaStreamTrack to the audio element
                const stream = new MediaStream([audioTrack]);
                audioEl.srcObject = stream;
                
                // Play the audio
                audioEl.play().catch((err) => {
                  console.error("[Voice] Failed to play audio:", err);
                });
                
                audioElementsRef.current.set(participantId, audioEl);
                console.log("[Voice] Created and attached audio element for participant:", participantId, "track:", audioTrack);
              }
            }, 100);
          } catch (err) {
            console.error("[Voice] Failed to handle remote track:", err);
          }
        }

        updateParticipantCount();
      };

      const handleTrackStopped = (evt?: DailyEvent) => {
        console.log("[Voice] Track stopped:", evt);
        if (!mountedRef.current) return;

        // Clean up audio element for remote participant
        if (evt?.participant && !evt.participant.local && evt.participant.session_id) {
          const participantId = evt.participant.session_id;
          const audioEl = audioElementsRef.current.get(participantId);
          if (audioEl) {
            audioEl.pause();
            audioEl.srcObject = null;
            if (audioEl.parentNode) {
              audioEl.parentNode.removeChild(audioEl);
            }
            audioElementsRef.current.delete(participantId);
          }
        }

        updateParticipantCount();
      };

      // Listen for audio play events to know when remote audio is playing
      const handleActiveSpeakerChange = (evt?: DailyEvent) => {
        console.log("[Voice] Active speaker changed:", evt);
      };

      callObject
        .on("joined-meeting", handleJoinedMeeting)
        .on("left-meeting", handleLeftMeeting)
        .on("participant-joined", handleParticipantJoined)
        .on("participant-left", handleParticipantLeft)
        .on("participant-updated", handleParticipantUpdated)
        .on("track-started", handleTrackStarted)
        .on("track-stopped", handleTrackStopped)
        .on("active-speaker-change", handleActiveSpeakerChange)
        .on("error", handleError);

      // 4. Join the room (audio only, no video)
      // Request microphone permission explicitly
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (permErr) {
        console.error("[Voice] Microphone permission denied:", permErr);
        if (mountedRef.current) {
          setError("Microphone permission required. Please allow microphone access.");
          setIsJoining(false);
          return;
        }
      }

      await callObject.join({
        url: roomData.roomUrl,
        token: roomData.meetingToken,
        userName: userId,
        startVideoOff: true,
        startAudioOff: false, // Start with audio ON
      });
    } catch (err) {
      console.error("[Voice] Failed to join:", err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to join voice chat");
        setIsJoining(false);
      }
      // Clean up on failure
      if (callObjectRef.current) {
        void callObjectRef.current.destroy().catch(() => {});
        callObjectRef.current = null;
      }
    }
  }, [shareToken, enabled, isJoining, isJoined, userId, updateParticipantCount]);

  // Leave voice chat
  const handleLeave = useCallback(async () => {
    if (!callObjectRef.current) return;
    try {
      await callObjectRef.current.leave();
      await callObjectRef.current.destroy();
    } catch {
      // Ignore errors on leave
    }
    callObjectRef.current = null;
    if (mountedRef.current) {
      setIsJoined(false);
      setIsMuted(false);
      setParticipantCount(0);
      setIsOpen(false);
    }
  }, []);

  // Toggle mute
  const handleToggleMute = useCallback(() => {
    if (!callObjectRef.current || !isJoined) return;
    const newMuted = !isMuted;
    try {
      callObjectRef.current.setLocalAudio(!newMuted);
      setIsMuted(newMuted);
      console.log("[Voice] Audio", newMuted ? "muted" : "unmuted");
    } catch (err) {
      console.error("[Voice] Failed to toggle audio:", err);
    }
  }, [isMuted, isJoined]);

  // Toggle panel open/close
  const handleTogglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
    setError(null);
  }, []);

  if (!shareToken || !enabled) return null;

  return (
    <>
      {/* Voice chat toggle button */}
      <button
        onClick={handleTogglePanel}
        className={`group flex items-center gap-2 rounded-md border backdrop-blur-sm px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition shadow-lg ${
          isJoined
            ? "border-green-500 bg-green-500/20 text-green-600 hover:bg-green-500/30"
            : "border-primary/50 bg-white dark:bg-white/95 text-primary hover:border-primary hover:bg-primary hover:text-white"
        }`}
        title={isOpen ? "Close voice chat" : "Open voice chat"}
        aria-label={isOpen ? "Close voice chat panel" : "Open voice chat panel"}
        tabIndex={0}
      >
        {isJoined ? (
          <>
            <Volume2 className="h-4 w-4 animate-pulse" />
            Voice
            {participantCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] opacity-80">
                <Users className="h-3 w-3" />
                {participantCount}
              </span>
            )}
          </>
        ) : (
          <>
            <Mic className="h-4 w-4" />
            Voice
          </>
        )}
      </button>

      {/* Voice chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 z-[100] w-[320px] rounded-xl border-2 border-primary/30 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between bg-primary/10 px-4 py-3 border-b border-primary/20">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-primary uppercase tracking-wider">
                Voice Chat
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isJoined && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              )}
              <button
                onClick={handleTogglePanel}
                className="text-muted-foreground hover:text-foreground transition text-lg leading-none px-1"
                aria-label="Close voice chat panel"
                tabIndex={0}
              >
                ×
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600">
                {error}
              </div>
            )}

            {/* Status */}
            {!isJoined && !isJoining && (
              <div className="text-center py-2">
                <p className="text-sm text-muted-foreground mb-3">
                  Join voice chat to talk with others in the office.
                </p>
                <button
                  onClick={handleJoin}
                  className="flex items-center justify-center gap-2 mx-auto rounded-lg bg-green-500 hover:bg-green-600 text-white px-6 py-2.5 text-sm font-bold uppercase tracking-wider transition shadow-md hover:shadow-lg"
                  aria-label="Join voice chat"
                  tabIndex={0}
                >
                  <Phone className="h-4 w-4" />
                  Join Voice
                </button>
              </div>
            )}

            {/* Joining state */}
            {isJoining && (
              <div className="text-center py-4">
                <div className="h-8 w-8 mx-auto mb-2 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">Connecting...</p>
              </div>
            )}

            {/* Connected controls */}
            {isJoined && (
              <div className="space-y-3">
                {/* Participant count */}
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{participantCount} in voice</span>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-3">
                  {/* Mute toggle */}
                  <button
                    onClick={handleToggleMute}
                    className={`flex items-center justify-center rounded-full h-12 w-12 transition shadow-md ${
                      isMuted
                        ? "bg-red-500/20 border-2 border-red-500 text-red-500 hover:bg-red-500/30"
                        : "bg-primary/10 border-2 border-primary/50 text-primary hover:bg-primary/20"
                    }`}
                    title={isMuted ? "Unmute" : "Mute"}
                    aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
                    tabIndex={0}
                  >
                    {isMuted ? (
                      <MicOff className="h-5 w-5" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                  </button>

                  {/* Leave button */}
                  <button
                    onClick={handleLeave}
                    className="flex items-center justify-center rounded-full h-12 w-12 bg-red-500 hover:bg-red-600 text-white transition shadow-md"
                    title="Leave voice chat"
                    aria-label="Leave voice chat"
                    tabIndex={0}
                  >
                    <PhoneOff className="h-5 w-5" />
                  </button>
                </div>

                {/* Mute status text */}
                <p className="text-center text-xs text-muted-foreground">
                  {isMuted ? "Microphone muted" : "Microphone active"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
