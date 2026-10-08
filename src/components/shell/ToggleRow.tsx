"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";

/** Label + hint on the left, switch on the right (e.g. "Strip metadata"). */
export function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-[13px] font-medium text-fg">
          {label}
        </label>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
