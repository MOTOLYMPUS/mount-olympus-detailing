// ─────────────────────────────────────────────────────────────────────────────
// Jarvis — the speech provider seam.
//
// The voice loop currently runs entirely in the browser (Web Speech API, see
// components/jarvis/VoiceConsole.tsx). That was chosen because it works today,
// on this machine, with nothing to install — but it has one real cost, stated
// plainly: in Chrome and Edge the microphone audio is sent to Google for
// transcription. It is not local, whatever "local assistant" implies.
//
// THIS FILE EXISTS SO THAT IS A SWAPPABLE DECISION RATHER THAN A REWRITE.
//
// Nothing on the server currently calls these — the browser does the work — so
// this is an interface and a migration note, not dead code pretending to be a
// feature. The path to a genuinely offline Jarvis is:
//
//   1. Install Python 3.11 and a local stack:
//        • wake word    — openWakeWord (an "hey jarvis" model ships with it)
//        • speech→text  — faster-whisper, `base.en` is enough for commands
//        • text→speech  — Piper, which is fast and sounds human on CPU
//   2. Run them as a small local HTTP service (a FastAPI app of ~100 lines)
//      that exposes /transcribe and /speak.
//   3. Implement the two interfaces below against that service, and set
//      JARVIS_SPEECH_PROVIDER=local.
//   4. Point VoiceConsole at /api/jarvis/speech instead of the Web Speech API:
//      it records audio with MediaRecorder and POSTs the blob.
//
// Nothing else in Jarvis changes. The voice brain (lib/jarvis/voice.ts) takes
// text and returns text, and has no idea where either came from — which is the
// whole reason that migration is a contained piece of work.
// ─────────────────────────────────────────────────────────────────────────────

export interface TranscriptionResult {
  text: string;
  /** 0-1 where the engine reports it. Null when it does not. */
  confidence: number | null;
}

export interface SpeechToText {
  name: string;
  /** True when the engine is reachable and configured. */
  available: () => Promise<boolean>;
  transcribe: (audio: Buffer, mimeType: string) => Promise<TranscriptionResult>;
}

export interface TextToSpeech {
  name: string;
  available: () => Promise<boolean>;
  /** Returns encoded audio the browser can play directly. */
  synthesize: (text: string) => Promise<{ audio: Buffer; mimeType: string }>;
}

export interface WakeWordDetector {
  name: string;
  /** Phrase this detector is trained on. */
  phrase: string;
}

/**
 * Which stack is in use. Read by the dashboard so the privacy note shown to the
 * owner always matches reality rather than being a stale hardcoded string.
 */
export type SpeechProvider = 'browser' | 'local';

export function speechProvider(): SpeechProvider {
  return process.env.JARVIS_SPEECH_PROVIDER?.trim() === 'local' ? 'local' : 'browser';
}

export interface SpeechCapabilities {
  provider: SpeechProvider;
  /** False for the browser provider — audio leaves the machine. */
  offline: boolean;
  note: string;
}

export function speechCapabilities(): SpeechCapabilities {
  return speechProvider() === 'local'
    ? {
        provider: 'local',
        offline: true,
        note: 'Speech is transcribed and spoken by a local engine. No audio leaves this machine.',
      }
    : {
        provider: 'browser',
        offline: false,
        note: "Speech is transcribed by the browser's built-in recognition. In Chrome and Edge that means audio is sent to Google's speech service. Nothing is recorded or stored, and only text reaches this server.",
      };
}
