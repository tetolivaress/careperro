"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Square } from "lucide-react";
import { TwoPaneTool, NativeSelect, primaryButton, secondaryButton } from "@/components/shell/TwoPaneTool";
import { Slider } from "@/components/ui/slider";

function subscribeVoices(cb: () => void) {
  if (typeof speechSynthesis === "undefined") return () => {};
  speechSynthesis.addEventListener("voiceschanged", cb);
  return () => speechSynthesis.removeEventListener("voiceschanged", cb);
}
let voiceCache: SpeechSynthesisVoice[] = [];
function getVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === "undefined") return voiceCache;
  const v = speechSynthesis.getVoices();
  // Keep the same array identity when the list didn't change so useSyncExternalStore stays stable.
  if (v.length !== voiceCache.length || v.some((x, i) => x.voiceURI !== voiceCache[i]?.voiceURI)) voiceCache = v;
  return voiceCache;
}
const EMPTY: SpeechSynthesisVoice[] = [];

type State = "idle" | "speaking" | "paused";

export default function TextToSpeechTool() {
  const t = useTranslations("text.tts");
  const [input, setInput] = useState("");
  const voices = useSyncExternalStore(subscribeVoices, getVoices, () => EMPTY);
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof speechSynthesis !== "undefined",
    () => true,
  );
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [volume, setVolume] = useState(1);
  const [state, setState] = useState<State>("idle");

  useEffect(() => () => speechSynthesis?.cancel(), []);

  const selectedVoice = voices.find((v) => v.voiceURI === voiceURI) ?? voices.find((v) => v.default) ?? voices[0];

  const speak = () => {
    if (!input.trim()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(input);
    if (selectedVoice) u.voice = selectedVoice;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = volume;
    u.onend = () => setState("idle");
    u.onerror = () => setState("idle");
    speechSynthesis.speak(u);
    setState("speaking");
  };
  const pause = () => {
    speechSynthesis.pause();
    setState("paused");
  };
  const resume = () => {
    speechSynthesis.resume();
    setState("speaking");
  };
  const stop = () => {
    speechSynthesis.cancel();
    setState("idle");
  };

  const sliderRow = (label: string, value: number, set: (v: number) => void, min: number, max: number, step: number) => (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[13px]">
        <span className="font-medium text-fg-muted">{label}</span>
        <span className="font-semibold text-fg tabular-nums">{value.toFixed(1)}×</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => set(Array.isArray(v) ? v[0] : v)} aria-label={label} />
    </div>
  );

  return (
    <TwoPaneTool
      input={input}
      onInputChange={setInput}
      inputPlaceholder={t("placeholder")}
      sample="Hello! This text is being read by your device, not by a server."
      mono={false}
      accept={[".txt", "text/plain"]}
      outputLabel={t("controls")}
      outputText={input}
      outputMeta={state === "speaking" ? t("speaking") : state === "paused" ? t("paused") : t("idle")}
      output={
        <div className="flex flex-1 flex-col gap-6 p-5">
          {!supported && <p className="text-sm text-danger">{t("unsupported")}</p>}
          <NativeSelect
            label={t("voice")}
            value={selectedVoice?.voiceURI ?? ""}
            onChange={setVoiceURI}
            className="[&>select]:max-w-full [&>select]:flex-1"
            options={voices.length ? voices.map((v) => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` })) : [{ value: "", label: t("noVoices") }]}
          />
          {sliderRow(t("rate"), rate, setRate, 0.5, 2, 0.1)}
          {sliderRow(t("pitch"), pitch, setPitch, 0.5, 2, 0.1)}
          {sliderRow(t("volume"), volume, setVolume, 0, 1, 0.1)}
          <div className="mt-auto flex flex-wrap gap-2">
            {state === "idle" && (
              <button type="button" onClick={speak} disabled={!supported || !input.trim()} className={primaryButton}>
                <Play className="size-4" aria-hidden /> {t("play")}
              </button>
            )}
            {state === "speaking" && (
              <button type="button" onClick={pause} className={secondaryButton}>
                <Pause className="size-4" aria-hidden /> {t("pause")}
              </button>
            )}
            {state === "paused" && (
              <button type="button" onClick={resume} className={primaryButton}>
                <Play className="size-4" aria-hidden /> {t("resume")}
              </button>
            )}
            {state !== "idle" && (
              <button type="button" onClick={stop} className={secondaryButton}>
                <Square className="size-4" aria-hidden /> {t("stop")}
              </button>
            )}
          </div>
          <p className="text-xs text-fg-subtle">{t("hint")}</p>
        </div>
      }
    />
  );
}
