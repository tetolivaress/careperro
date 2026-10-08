"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const subscribeNoop = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const isDark = mounted ? resolvedTheme !== "light" : true;
  const next = isDark ? "light" : "dark";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setTheme(next)}
            className={cn(
              "flex size-9 items-center justify-center rounded-sm border border-border text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              className,
            )}
            aria-label={`Switch to ${next} theme`}
          />
        }
      >
        {isDark ? <Moon className="size-4" aria-hidden /> : <Sun className="size-4" aria-hidden />}
      </TooltipTrigger>
      <TooltipContent>Switch to {next} theme</TooltipContent>
    </Tooltip>
  );
}

/** Three-way segmented theme switch used in the mobile drawer. */
export function ThemeSegmented({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const current = mounted ? (theme ?? "system") : "system";
  const options = [
    { value: "system", label: "Auto" },
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ] as const;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("flex gap-0.5 rounded-[10px] border border-border bg-surface-2 p-[3px]", className)}
    >
      {options.map((o) => {
        const active = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            className={cn(
              "h-[30px] min-w-[53px] flex-1 rounded-[7px] px-2 text-[13px] transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none",
              active ? "bg-surface-3 font-semibold text-fg" : "font-medium text-fg-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
