"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { ToolHeader, Pane, OptionCheckbox, NativeSelect, primaryButton, secondaryButton } from "@/components/shell/TwoPaneTool";
import { Segmented } from "@/components/shell/Segmented";
import { Slider } from "@/components/ui/slider";
import { SITE } from "@/lib/site";
import { cn } from "@/lib/utils";

type Phase = "work" | "short" | "long";

interface Settings {
  work: number;
  short: number;
  long: number;
  longEvery: number;
  autoStart: boolean;
  sound: boolean;
  notify: boolean;
}

interface TimerState {
  phase: Phase;
  /** Wall-clock end while running; null while paused or idle. */
  endAt: number | null;
  /** Milliseconds left while paused or idle. */
  remaining: number;
  /** Focus sessions finished in the current cycle (resets after a long break). */
  cycle: number;
}

interface Today {
  date: string;
  count: number;
  minutes: number;
}

const STORAGE_KEY = "toolbox-pomodoro";
const DEFAULTS: Settings = { work: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true, notify: false };
const MIN = 60_000;

const todayKey = () => new Date().toLocaleDateString("en-CA");
const minutesFor = (s: Settings, p: Phase) => (p === "work" ? s.work : p === "short" ? s.short : s.long);
const fullMs = (s: Settings, p: Phase) => minutesFor(s, p) * MIN;
const freshTimer = (s: Settings, phase: Phase, cycle: number): TimerState => ({ phase, endAt: null, remaining: fullMs(s, phase), cycle });

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Three short rising beeps through Web Audio; no audio file to fetch. */
function beep(ctx: AudioContext) {
  [0, 0.25, 0.5].forEach((offset, i) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 660 + i * 220;
    const t0 = ctx.currentTime + offset;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.22);
  });
}

function load(): { settings: Settings; timer: TimerState | null; today: Today } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { settings?: Partial<Settings>; timer?: TimerState; today?: Today };
    const settings = { ...DEFAULTS, ...data.settings };
    const today = data.today?.date === todayKey() ? data.today : { date: todayKey(), count: 0, minutes: 0 };
    return { settings, timer: data.timer ?? null, today };
  } catch {
    return null;
  }
}

export default function PomodoroTool() {
  const t = useTranslations("productivity.pomodoro");
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [timer, setTimer] = useState<TimerState>(() => freshTimer(DEFAULTS, "work", 0));
  const [today, setToday] = useState<Today>({ date: "", count: 0, minutes: 0 });
  const [now, setNow] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [notifyBlocked, setNotifyBlocked] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const worker = useRef<Worker | null>(null);

  // Read saved state after mount so server and client markup match.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const saved = load();
      if (saved) {
        setSettings(saved.settings);
        setToday(saved.today);
        if (saved.timer) setTimer(saved.timer);
      } else {
        setToday({ date: todayKey(), count: 0, minutes: 0 });
      }
      setNow(Date.now());
      setLoaded(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, timer, today }));
    } catch {
      /* private mode or full storage: the timer still works for this visit */
    }
  }, [settings, timer, today, loaded]);

  const running = timer.endAt !== null;
  const remaining = running ? Math.max(0, (timer.endAt ?? 0) - now) : timer.remaining;
  const total = fullMs(settings, timer.phase);
  const progress = total > 0 ? 1 - remaining / total : 0;

  const finish = useCallback(() => {
    const finished = timer.phase;
    let cycle = timer.cycle;
    let next: Phase;
    if (finished === "work") {
      cycle += 1;
      next = cycle % settings.longEvery === 0 ? "long" : "short";
      const date = todayKey();
      setToday((d) => (d.date === date ? { date, count: d.count + 1, minutes: d.minutes + settings.work } : { date, count: 1, minutes: settings.work }));
    } else {
      next = "work";
      if (finished === "long") cycle = 0;
    }
    const fresh = freshTimer(settings, next, cycle);
    setTimer(settings.autoStart ? { ...fresh, endAt: Date.now() + fresh.remaining } : fresh);

    const message = t(`done.${finished}`);
    toast.success(message);
    if (settings.sound && audio.current) beep(audio.current);
    if (settings.notify && typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
      try {
        new Notification(SITE.name, { body: message, icon: "/icons/icon-192.png", tag: "pomodoro" });
      } catch {
        /* some mobile browsers only allow notifications from a service worker */
      }
    }
  }, [timer.phase, timer.cycle, settings, t]);

  // Display tick plus the worker alarm. The tick also catches the end if the worker is unavailable.
  useEffect(() => {
    if (timer.endAt === null) return;
    const endAt = timer.endAt;
    let fired = false;
    const done = () => {
      if (fired) return;
      fired = true;
      finish();
    };
    const tick = () => {
      const n = Date.now();
      setNow(n);
      if (n >= endAt) done();
    };
    tick();
    const interval = window.setInterval(tick, 250);
    try {
      worker.current ??= new Worker(new URL("../../workers/timer.worker.ts", import.meta.url), { type: "module" });
      worker.current.onmessage = done;
      worker.current.postMessage({ endAt });
    } catch {
      /* the interval still ends the session */
    }
    return () => {
      window.clearInterval(interval);
      worker.current?.postMessage(null);
    };
  }, [timer.endAt, finish]);

  useEffect(() => () => worker.current?.terminate(), []);

  // Countdown in the tab title while running.
  useEffect(() => {
    if (!running) return;
    const original = document.title;
    document.title = `${format(remaining)} · ${t(`phases.${timer.phase}`)}`;
    return () => {
      document.title = original;
    };
  }, [running, remaining, timer.phase, t]);

  const start = () => {
    // Create (or resume) the audio context inside the click so browsers allow it to play later.
    if (settings.sound) {
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume();
      } catch {
        /* no Web Audio: silent alarm */
      }
    }
    setTimer((s) => ({ ...s, endAt: Date.now() + (s.remaining > 0 ? s.remaining : fullMs(settings, s.phase)) }));
  };
  const pause = () => setTimer((s) => (s.endAt === null ? s : { ...s, endAt: null, remaining: Math.max(0, s.endAt - Date.now()) }));
  const toggle = () => (running ? pause() : start());
  const reset = () => setTimer((s) => freshTimer(settings, s.phase, s.cycle));
  const skip = () =>
    setTimer((s) => {
      const next: Phase = s.phase === "work" ? ((s.cycle + 1) % settings.longEvery === 0 ? "long" : "short") : "work";
      // Skipping focus doesn't count it, but still advances toward the long break like a finished one would.
      const cycle = s.phase === "work" ? s.cycle + 1 : s.phase === "long" ? 0 : s.cycle;
      return freshTimer(settings, next, cycle);
    });
  const choosePhase = (p: Phase) => setTimer((s) => freshTimer(settings, p, s.cycle));

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    // An untouched idle timer follows the new length; a started one keeps its time.
    setTimer((s) => (s.endAt === null && s.remaining === fullMs(settings, s.phase) ? freshTimer(next, s.phase, s.cycle) : s));
  };

  const setNotify = async (on: boolean) => {
    setNotifyBlocked(false);
    if (!on) return updateSettings({ notify: false });
    if (typeof Notification === "undefined") return setNotifyBlocked(true);
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission === "granted") updateSettings({ notify: true });
    else setNotifyBlocked(true);
  };

  // Keyboard: Space toggles, R resets, S skips — only when focus isn't in a control that uses those keys.
  const keys = useRef({ toggle, reset, skip });
  useEffect(() => {
    keys.current = { toggle, reset, skip };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, button, [role=slider], [role=radio], [contenteditable=true]")) return;
      const k = e.key.toLowerCase();
      if (k === " ") {
        e.preventDefault();
        keys.current.toggle();
      } else if (k === "r") keys.current.reset();
      else if (k === "s") keys.current.skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isWork = timer.phase === "work";
  const ring = 2 * Math.PI * 140;
  const sessionNumber = Math.max(1, Math.min(timer.cycle + (isWork ? 1 : 0), settings.longEvery));
  const started = running || timer.remaining < total;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center border-b border-border px-4 py-3 md:px-6">
        <ToolHeader />
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 md:grid-cols-[1fr_360px] md:p-6">
        <Pane title={t(`phases.${timer.phase}`)} meta={t("session", { current: sessionNumber, total: settings.longEvery })}>
          <div className="flex flex-1 flex-col items-center justify-center gap-7 px-4 py-8">
            <Segmented
              label={t("phase")}
              size="sm"
              className="max-w-sm"
              value={timer.phase}
              onChange={choosePhase}
              options={[
                { value: "work", label: t("phases.work") },
                { value: "short", label: t("phases.short") },
                { value: "long", label: t("phases.long") },
              ]}
            />

            <div className="relative size-64 sm:size-72">
              <svg viewBox="0 0 300 300" className="size-full -rotate-90" aria-hidden>
                <circle cx="150" cy="150" r="140" fill="none" strokeWidth="8" className="stroke-surface-3" />
                <circle
                  cx="150"
                  cy="150"
                  r="140"
                  fill="none"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={ring}
                  strokeDashoffset={ring * (1 - progress)}
                  className={cn("transition-[stroke-dashoffset] duration-300 ease-linear", isWork ? "stroke-primary" : "stroke-[var(--code-literal)]")}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                <span role="timer" aria-live="off" className="font-mono text-6xl font-semibold tracking-tight text-fg tabular-nums sm:text-7xl">
                  {format(remaining)}
                </span>
                <span className={cn("text-sm font-medium", isWork ? "text-primary" : "text-[var(--code-literal)]")}>{t(`phases.${timer.phase}`)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={reset} disabled={!started} aria-label={t("reset")} title={t("reset")} className={cn(secondaryButton, "w-10 justify-center px-0")}>
                <RotateCcw className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={toggle} className={cn(primaryButton, "h-12 min-w-36 justify-center text-base")}>
                {running ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
                {running ? t("pause") : started ? t("resume") : t("start")}
              </button>
              <button type="button" onClick={skip} aria-label={t("skip")} title={t("skip")} className={cn(secondaryButton, "w-10 justify-center px-0")}>
                <SkipForward className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-1.5" aria-hidden>
                {Array.from({ length: settings.longEvery }, (_, i) => (
                  <span key={i} className={cn("size-2 rounded-full", i < timer.cycle ? "bg-primary" : "bg-surface-3")} />
                ))}
              </div>
              <p className="text-xs text-fg-muted">
                {t("todayCount", { count: today.count })}
                {today.minutes > 0 && ` · ${t("todayMinutes", { minutes: today.minutes })}`}
              </p>
            </div>
          </div>
        </Pane>

        <Pane title={t("settings")}>
          <div className="flex flex-1 flex-col gap-5 p-4">
            {(["work", "short", "long"] as const).map((p) => (
              <div key={p} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-fg-muted">{t(`${p}Minutes`)}</span>
                  <span className="font-semibold text-fg tabular-nums">{settings[p]}</span>
                </div>
                <Slider
                  value={[settings[p]]}
                  min={1}
                  max={p === "work" ? 90 : p === "short" ? 30 : 60}
                  step={1}
                  onValueChange={(v) => updateSettings({ [p]: Array.isArray(v) ? v[0] : v })}
                  aria-label={t(`${p}Minutes`)}
                />
              </div>
            ))}
            <NativeSelect
              label={t("longEvery")}
              value={String(settings.longEvery) as "2" | "3" | "4" | "5" | "6"}
              onChange={(v) => updateSettings({ longEvery: Number(v) })}
              options={(["2", "3", "4", "5", "6"] as const).map((n) => ({ value: n, label: t("longEveryValue", { count: Number(n) }) }))}
            />
            <div className="flex flex-col gap-2">
              <OptionCheckbox label={t("autoStart")} checked={settings.autoStart} onChange={(v) => updateSettings({ autoStart: v })} />
              <OptionCheckbox label={t("sound")} checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
              <OptionCheckbox label={t("notify")} checked={settings.notify} onChange={(v) => void setNotify(v)} />
              {notifyBlocked && <p className="text-xs text-warning">{t("notifyBlocked")}</p>}
            </div>
            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs text-fg-subtle">{t("shortcuts")}</p>
              {today.count > 0 && (
                <button type="button" onClick={() => setToday({ date: todayKey(), count: 0, minutes: 0 })} className="self-start text-xs font-medium text-fg-muted underline-offset-2 hover:text-fg hover:underline">
                  {t("resetToday")}
                </button>
              )}
            </div>
          </div>
        </Pane>
      </div>
    </div>
  );
}
