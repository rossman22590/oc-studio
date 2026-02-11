"use client";

import { useEffect, useRef, useState } from "react";

// Web Speech API type declarations
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

type VoiceDictationButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export const VoiceDictationButton = ({
  onTranscript,
  disabled = false,
}: VoiceDictationButtonProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [micPermission, setMicPermission] = useState<"prompt" | "granted" | "denied">("prompt");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(() => {
    // Check if Speech Recognition API is available
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setIsSupported(false);
      return;
    }

    // Check current mic permission state (if API available)
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => {
          setMicPermission(result.state as "prompt" | "granted" | "denied");
          result.onchange = () => {
            setMicPermission(result.state as "prompt" | "granted" | "denied");
          };
        })
        .catch(() => {
          // permissions.query not supported for microphone in some browsers
        });
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        onTranscriptRef.current(finalTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // "aborted" is normal when stopping/restarting — ignore it
      if (event.error === "aborted" || event.error === "no-speech") {
        setIsListening(false);
        return;
      }
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed") {
        setMicPermission("denied");
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const requestMicAndStart = async () => {
    try {
      // Explicitly request microphone permission via getUserMedia
      // This triggers the browser consent prompt
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately — we only needed the consent
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");

      // Now start recognition
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      }
    } catch (err) {
      console.error("Microphone access denied:", err);
      setMicPermission("denied");
    }
  };

  const handleToggle = async () => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      if (micPermission !== "granted") {
        // Need to request permission first
        await requestMicAndStart();
      } else {
        recognitionRef.current.start();
        setIsListening(true);
      }
    }
  };

  if (!isSupported) {
    return null;
  }

  if (micPermission === "denied") {
    return (
      <button
        type="button"
        disabled
        className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-red-400 opacity-60 cursor-not-allowed"
        title="Microphone access denied — enable in browser settings"
      >
        🎤✕
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={disabled}
      className={`rounded-md border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isListening
          ? "border-red-500/80 bg-red-500/20 text-red-600 dark:text-red-400 animate-pulse"
          : "border-border/80 bg-card/70 text-foreground hover:bg-muted/70"
      }`}
      title={isListening ? "Stop listening" : "Start voice dictation"}
    >
      🎤
    </button>
  );
};
