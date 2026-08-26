'use client';

// ─────────────────────────────────────────────────────────────────────────────
// The voice interface.
//
// Wake phrase → speech-to-text → POST /api/jarvis/voice → text-to-speech, in a
// loop, using the browser's Web Speech API. No audio ever leaves this component
// as audio: the server receives text and returns text.
//
// ⚠️  PRIVACY, STATED PLAINLY: in Chrome and Edge, `SpeechRecognition` streams
// microphone audio to Google's servers for transcription. It is not local. The
// UI says so, and `lib/jarvis/speech.ts` documents the swap to a local Whisper
// engine. Anyone who needs true offline should read that before switching this
// on in a shop where customers can be overheard.
//
// THE STATE MACHINE, and why it is explicit:
//
//   idle ──start──► waiting ──wake phrase──► listening ──silence──► thinking
//     ▲                ▲                                              │
//     └────stop────────┴──────────── speaking ◄──── reply ────────────┘
//
// A boolean pair (`isListening`, `isAwake`) cannot express "transcribing while
// the reply is still being spoken", which is precisely the state that produces
// the classic bug of the assistant hearing itself and answering its own voice.
// Recognition is therefore SUSPENDED while speaking — see `speak()`.
//
// Everything here is defensive because the Web Speech API is unreliable by
// nature: Chrome ends recognition roughly every minute, fires `no-speech`
// constantly, and silently stops after a tab backgrounds. The restart logic
// exists so a console left running all day is still listening at 5pm.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

// ── Web Speech API types ─────────────────────────────────────────────────────
// Hand-written because they are not in TypeScript's DOM library: the API is a
// non-standard, prefixed extension that never made it into the DOM spec.

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ── Tuning ───────────────────────────────────────────────────────────────────

/** Silence after which a command is considered finished and sent. */
const COMMAND_SILENCE_MS = 1800;

/** Give up waiting for a command that never came after the wake phrase. */
const COMMAND_TIMEOUT_MS = 12_000;

/**
 * Backoff before restarting recognition. Chrome fires `onend` immediately and
 * repeatedly when the microphone is unavailable; restarting with no delay spins
 * the CPU and floods the console.
 */
const RESTART_DELAY_MS = 400;
const RESTART_BACKOFF_MAX_MS = 8000;

type Mode = 'idle' | 'waiting' | 'listening' | 'thinking' | 'speaking';

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  taskId?: string | null;
  agent?: string | null;
  at: number;
}

export default function VoiceConsole({ wakePhrase }: { wakePhrase: string }) {
  const [mode, setMode] = useState<Mode>('idle');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interim, setInterim] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [typed, setTyped] = useState('');
  const [muted, setMuted] = useState(false);

  // Refs, not state, for everything the recognition callbacks read: those
  // callbacks are attached once and would otherwise close over the first
  // render's values forever.
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const modeRef = useRef<Mode>('idle');
  const enabledRef = useRef(false);
  const bufferRef = useRef('');
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartDelay = useRef(RESTART_DELAY_MS);
  const mutedRef = useRef(false);
  const turnsRef = useRef<Turn[]>([]);
  const submittingRef = useRef(false);

  const setModeSafe = useCallback((next: Mode) => {
    modeRef.current = next;
    setMode(next);
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const clearTimers = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    if (commandTimer.current) clearTimeout(commandTimer.current);
    silenceTimer.current = null;
    commandTimer.current = null;
  }, []);

  // ── Speaking ───────────────────────────────────────────────────────────────

  /**
   * Speak a reply, with recognition suspended for the duration.
   *
   * Without the suspend, the microphone hears the speakers, the wake phrase in
   * Jarvis's own reply retriggers it, and it talks to itself indefinitely.
   */
  const speak = useCallback(
    (utteranceText: string) =>
      new Promise<void>((resolve) => {
        if (mutedRef.current || typeof window === 'undefined' || !window.speechSynthesis) {
          resolve();
          return;
        }

        try {
          recognitionRef.current?.abort();
        } catch {
          // Already stopped; nothing to do.
        }

        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(utteranceText);
        utterance.rate = 1.05; // slightly quick — it reads as confident
        utterance.pitch = 1;

        // Chrome occasionally never fires `onend` for a long utterance, which
        // would strand the console in 'speaking' forever. The timeout is a
        // generous estimate of speech duration plus a margin.
        const fallback = setTimeout(
          () => resolve(),
          Math.min(2000 + utteranceText.length * 70, 45_000)
        );
        const finish = () => {
          clearTimeout(fallback);
          resolve();
        };

        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      }),
    []
  );

  // ── Recognition lifecycle ──────────────────────────────────────────────────

  const scheduleRestart = useCallback((delay = restartDelay.current) => {
    if (restartTimer.current) clearTimeout(restartTimer.current);
    restartTimer.current = setTimeout(() => {
      if (!enabledRef.current) return;
      if (modeRef.current === 'thinking' || modeRef.current === 'speaking') return;
      try {
        recognitionRef.current?.start();
      } catch {
        // `start()` throws if it is already running — harmless, and the common
        // case when several restart paths race.
      }
    }, delay);
  }, []);

  // ── Sending a turn ─────────────────────────────────────────────────────────

  const submit = useCallback(
    async (transcript: string) => {
      const trimmed = transcript.trim();
      if (!trimmed || submittingRef.current) return;

      submittingRef.current = true;
      clearTimers();
      setInterim('');
      setModeSafe('thinking');
      setTurns((prev) => [...prev, { role: 'user', content: trimmed, at: Date.now() }]);

      let reply = 'Something went wrong on my end.';
      let taskId: string | null = null;
      let agent: string | null = null;

      try {
        const res = await fetch('/api/jarvis/voice', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            transcript: trimmed,
            // Only the last few turns: enough for "what about last month?" to
            // resolve, not enough to grow the cost of every turn.
            history: turnsRef.current.slice(-6).map((t) => ({ role: t.role, content: t.content })),
          }),
        });

        const data = (await res.json()) as {
          ok?: boolean;
          reply?: string;
          error?: string;
          taskId?: string | null;
          agent?: string | null;
        };

        if (res.status === 429) {
          reply = "I've hit my rate limit. Give me a minute.";
        } else if (!res.ok || !data.ok) {
          reply = data.error ?? reply;
        } else {
          reply = data.reply ?? reply;
          taskId = data.taskId ?? null;
          agent = data.agent ?? null;
        }
      } catch {
        reply = "I couldn't reach the server. Check the connection.";
      }

      setTurns((prev) => [...prev, { role: 'assistant', content: reply, taskId, agent, at: Date.now() }]);
      submittingRef.current = false;

      setModeSafe('speaking');
      await speak(reply);

      // Back to the wake phrase — unless the owner switched the console off
      // while it was talking.
      if (enabledRef.current) {
        setModeSafe('waiting');
        scheduleRestart(0);
      } else {
        setModeSafe('idle');
      }
    },
    [clearTimers, scheduleRestart, setModeSafe, speak]
  );

  /**
   * Submit once the owner stops talking. Reset on every result, so a pause for
   * breath mid-sentence does not cut them off — only real silence sends.
   */
  const armSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => {
      if (modeRef.current !== 'listening') return;
      const text = bufferRef.current.trim();
      bufferRef.current = '';
      if (text) void submit(text);
      else {
        setInterim('');
        setModeSafe('waiting');
      }
    }, COMMAND_SILENCE_MS);
  }, [setModeSafe, submit]);

  const handleResult = useCallback(
    (event: SpeechRecognitionEvent) => {
      // A successful result means the microphone is healthy; reset the backoff.
      restartDelay.current = RESTART_DELAY_MS;

      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += text;
        else interimText += text;
      }

      const current = modeRef.current;

      if (current === 'waiting') {
        const heard = `${finalText} ${interimText}`.toLowerCase();
        const index = heard.indexOf(wakePhrase.toLowerCase());
        if (index === -1) {
          // Show what is being heard so the owner can see the mic is live, but
          // do not retain it — this is the always-on path and nothing said
          // before the wake phrase is kept or sent.
          setInterim(interimText.trim().slice(-60));
          return;
        }

        // Anything said after the wake phrase in the same breath is already the
        // command: "Hey Jarvis, what's revenue this month" must not need a pause.
        const remainder = `${finalText} ${interimText}`.slice(index + wakePhrase.length).trim();
        bufferRef.current = remainder;
        setInterim(remainder);
        setModeSafe('listening');

        if (commandTimer.current) clearTimeout(commandTimer.current);
        commandTimer.current = setTimeout(() => {
          if (modeRef.current !== 'listening') return;
          if (bufferRef.current.trim()) void submit(bufferRef.current);
          else {
            setInterim('');
            setModeSafe('waiting');
          }
        }, COMMAND_TIMEOUT_MS);

        if (remainder) armSilenceTimer();
        return;
      }

      if (current === 'listening') {
        if (finalText) bufferRef.current = `${bufferRef.current} ${finalText}`.trim();
        setInterim(`${bufferRef.current} ${interimText}`.trim());
        if (bufferRef.current || interimText) armSilenceTimer();
      }
    },
    [armSilenceTimer, setModeSafe, submit, wakePhrase]
  );

  useEffect(() => {
    const Ctor = recognitionCtor();
    setSupported(!!Ctor);
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = handleResult as (e: SpeechRecognitionEvent) => void;

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Routine and expected: the API fires these constantly during silence.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        enabledRef.current = false;
        setModeSafe('idle');
        setError(
          'Microphone access was denied. Allow it in the address bar, then start Jarvis again.'
        );
        return;
      }

      if (event.error === 'network') {
        // Speech recognition needs the network in Chrome. Back off rather than
        // hammering a connection that is already down.
        restartDelay.current = Math.min(restartDelay.current * 2, RESTART_BACKOFF_MAX_MS);
        setError('Speech recognition lost its connection. Retrying.');
        return;
      }

      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      // Chrome ends recognition on its own roughly every minute. Restarting is
      // what makes "always listening" actually always.
      if (enabledRef.current) scheduleRestart();
    };

    recognitionRef.current = recognition;

    return () => {
      enabledRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Already stopped.
      }
      if (restartTimer.current) clearTimeout(restartTimer.current);
      if (silenceTimer.current) clearTimeout(silenceTimer.current);
      if (commandTimer.current) clearTimeout(commandTimer.current);
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, [handleResult, scheduleRestart, setModeSafe]);

  // ── Controls ───────────────────────────────────────────────────────────────

  const start = useCallback(() => {
    setError(null);
    enabledRef.current = true;
    setModeSafe('waiting');
    scheduleRestart(0);
  }, [scheduleRestart, setModeSafe]);

  const stop = useCallback(() => {
    enabledRef.current = false;
    clearTimers();
    bufferRef.current = '';
    setInterim('');
    setModeSafe('idle');
    try {
      recognitionRef.current?.abort();
    } catch {
      // Already stopped.
    }
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
  }, [clearTimers, setModeSafe]);

  /** Skip the wake phrase — for a noisy shop, or when it keeps mishearing. */
  const pushToTalk = useCallback(() => {
    setError(null);
    enabledRef.current = true;
    bufferRef.current = '';
    setInterim('');
    setModeSafe('listening');
    scheduleRestart(0);
    if (commandTimer.current) clearTimeout(commandTimer.current);
    commandTimer.current = setTimeout(() => {
      if (modeRef.current === 'listening' && !bufferRef.current.trim()) {
        setModeSafe(enabledRef.current ? 'waiting' : 'idle');
        setInterim('');
      }
    }, COMMAND_TIMEOUT_MS);
  }, [scheduleRestart, setModeSafe]);

  const sendTyped = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const value = typed.trim();
      if (!value) return;
      setTyped('');
      void submit(value);
    },
    [submit, typed]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const busy = mode === 'thinking' || mode === 'speaking';

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-white/10 bg-charcoal/40 p-6 shadow-card backdrop-blur-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Orb mode={mode} />
            <div>
              <p className="font-display text-sm font-semibold text-white">{statusLine(mode, wakePhrase)}</p>
              <p className="mt-0.5 text-xs text-subtle">{hint(mode, wakePhrase)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {mode === 'idle' ? (
              <button
                type="button"
                onClick={start}
                disabled={supported === false}
                className="rounded-sm bg-apex px-5 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-apex/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Start listening
              </button>
            ) : (
              <button
                type="button"
                onClick={stop}
                className="rounded-sm border border-white/20 px-5 py-2 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/5"
              >
                Stop
              </button>
            )}

            <button
              type="button"
              onClick={pushToTalk}
              disabled={supported === false || busy}
              className="rounded-sm border border-white/20 px-4 py-2 text-sm font-medium text-muted transition-colors duration-200 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              title="Talk without saying the wake phrase"
            >
              Talk now
            </button>

            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="rounded-sm border border-white/20 px-4 py-2 text-sm font-medium text-muted transition-colors duration-200 hover:bg-white/5 hover:text-white"
              title={muted ? 'Jarvis will speak replies' : 'Jarvis will stay silent'}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
          </div>
        </div>

        {interim && (
          <p className="mt-4 truncate rounded-sm bg-white/5 px-3 py-2 text-sm italic text-subtle">
            {interim}
          </p>
        )}

        {supported === false && (
          <p className="mt-4 rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-100">
            This browser has no speech recognition. Chrome or Edge on desktop supports it — or use
            the text box below, which does everything voice does.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-sm border border-apex/40 bg-apex/5 px-3 py-2 text-sm text-red-100">{error}</p>
        )}
      </div>

      {/* The typed fallback. Always present, never hidden behind a toggle: it is
          the thing that works when the microphone does not. */}
      <form onSubmit={sendTyped} className="flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type it…"
          disabled={busy}
          className="flex-1 rounded-sm border border-white/15 bg-charcoal/60 px-5 py-2.5 text-sm text-white outline-none transition placeholder:text-subtle focus:border-white/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !typed.trim()}
          className="rounded-sm bg-apex px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-apex/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>

      {turns.length > 0 && (
        <div className="space-y-3">
          {turns
            .slice()
            .reverse()
            .map((turn) => (
              <div
                key={`${turn.at}-${turn.role}`}
                className={clsx(
                  'rounded-sm px-4 py-3 text-sm',
                  turn.role === 'user'
                    ? 'ml-8 border border-white/5 bg-white/5 text-muted'
                    : 'mr-8 border border-white/10 bg-charcoal/40 text-white shadow-card'
                )}
              >
                <p className="whitespace-pre-wrap">{turn.content}</p>
                {turn.taskId && (
                  <p className="mt-2 text-xs text-subtle">
                    Queued for the {turn.agent} agent ·{' '}
                    <a href="/jarvis/activity" className="underline">
                      watch it
                    </a>
                  </p>
                )}
              </div>
            ))}
        </div>
      )}

      <p className="text-xs text-subtle">
        Speech recognition and speech synthesis run in your browser. In Chrome and Edge the audio is
        transcribed by Google&rsquo;s service, so this is not fully offline — nothing is recorded or
        stored, and only the resulting text reaches the server.
      </p>
    </div>
  );
}

// ── Presentation ─────────────────────────────────────────────────────────────

function Orb({ mode }: { mode: Mode }) {
  return (
    <span className="relative flex h-12 w-12 items-center justify-center">
      <span
        className={clsx(
          'absolute inset-0 rounded-full transition',
          mode === 'idle' && 'bg-white/10',
          mode === 'waiting' && 'bg-emerald-500/20',
          mode === 'listening' && 'animate-pulse bg-sky-500/25',
          mode === 'thinking' && 'animate-pulse bg-amber-500/25',
          mode === 'speaking' && 'bg-violet-500/25'
        )}
      />
      <span
        className={clsx(
          'relative h-3.5 w-3.5 rounded-full transition',
          mode === 'idle' && 'bg-subtle',
          mode === 'waiting' && 'bg-emerald-400',
          mode === 'listening' && 'bg-sky-400',
          mode === 'thinking' && 'bg-amber-400',
          mode === 'speaking' && 'bg-violet-400'
        )}
      />
    </span>
  );
}

function statusLine(mode: Mode, wakePhrase: string): string {
  switch (mode) {
    case 'idle':
      return 'Jarvis is off';
    case 'waiting':
      return `Listening for “${wakePhrase}”`;
    case 'listening':
      return 'Go ahead';
    case 'thinking':
      return 'Working on it';
    case 'speaking':
      return 'Speaking';
  }
}

function hint(mode: Mode, wakePhrase: string): string {
  switch (mode) {
    case 'idle':
      return 'Start listening, then just talk. Nothing is processed until the wake phrase.';
    case 'waiting':
      return `Say “${wakePhrase}” followed by what you need.`;
    case 'listening':
      return 'Stop talking when you are done and it will send.';
    case 'thinking':
      return 'Reading the business data.';
    case 'speaking':
      return 'The microphone is paused so it does not hear itself.';
  }
}
