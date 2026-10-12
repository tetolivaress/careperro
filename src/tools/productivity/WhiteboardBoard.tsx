"use client";

import { useCallback, useEffect, useRef } from "react";
import { Excalidraw, MainMenu, WelcomeScreen, getSceneVersion } from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import { loadBoard, saveBoard } from "./lib/boardStore";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Our locales mapped to Excalidraw's language codes ("en" is its built-in default). */
const LANG: Record<string, string> = {
  es: "es-ES",
  en: "en",
  zh: "zh-CN",
  ar: "ar-SA",
  pt: "pt-BR",
  fr: "fr-FR",
  id: "id-ID",
  ja: "ja-JP",
  ru: "ru-RU",
  de: "de-DE",
  hi: "hi-IN",
};

/** View settings worth restoring; everything else (selection, open dialogs, collaborators) starts fresh. */
const KEPT_APP_STATE = ["viewBackgroundColor", "gridModeEnabled", "zoom", "scrollX", "scrollY", "currentItemStrokeColor", "currentItemBackgroundColor", "currentItemFontFamily", "currentItemStrokeWidth", "currentItemRoughness"] as const;

const SAVE_DELAY = 600;

export default function WhiteboardBoard({
  locale,
  theme,
  welcome,
  onStatus,
}: {
  locale: string;
  theme: "light" | "dark";
  welcome: string;
  onStatus: (status: SaveStatus) => void;
}) {
  const lastSignature = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<(() => Promise<void>) | null>(null);

  const initialData = useCallback(async (): Promise<ExcalidrawInitialDataState | null> => {
    const saved = await loadBoard();
    if (!saved) return null;
    return { ...saved, scrollToContent: false } as ExcalidrawInitialDataState;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const job = pending.current;
    pending.current = null;
    if (job) void job();
  }, []);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      // onChange also fires for pointer moves and selection; only save when the drawing itself changed.
      const signature = `${getSceneVersion(elements)}|${Object.keys(files).length}|${appState.viewBackgroundColor}|${appState.gridModeEnabled}`;
      if (lastSignature.current === null) {
        // First call is the restored scene: nothing new to save.
        lastSignature.current = signature;
        return;
      }
      if (signature === lastSignature.current) return;
      lastSignature.current = signature;

      const kept: Record<string, unknown> = {};
      for (const k of KEPT_APP_STATE) kept[k] = appState[k];
      pending.current = async () => {
        try {
          await saveBoard({ elements: elements.filter((e) => !e.isDeleted), appState: kept, files });
          onStatus("saved");
        } catch {
          onStatus("error");
        }
      };
      onStatus("saving");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
    },
    [flush, onStatus],
  );

  // Don't lose the last strokes when the tab is hidden or the tool is left.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [flush]);

  return (
    <Excalidraw
      initialData={initialData}
      onChange={onChange}
      theme={theme}
      langCode={LANG[locale] ?? "en"}
      aiEnabled={false}
      UIOptions={{ canvasActions: { toggleTheme: false } }}
    >
      <MainMenu>
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.SaveToActiveFile />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <WelcomeScreen>
        <WelcomeScreen.Hints.MenuHint />
        <WelcomeScreen.Hints.ToolbarHint />
        <WelcomeScreen.Hints.HelpHint />
        <WelcomeScreen.Center>
          <WelcomeScreen.Center.Heading>{welcome}</WelcomeScreen.Center.Heading>
          <WelcomeScreen.Center.Menu>
            <WelcomeScreen.Center.MenuItemLoadScene />
            <WelcomeScreen.Center.MenuItemHelp />
          </WelcomeScreen.Center.Menu>
        </WelcomeScreen.Center>
      </WelcomeScreen>
    </Excalidraw>
  );
}
