import { cn } from "@/lib/utils";
import { icons, type IconName } from "@/lib/icons";

interface IconTileProps {
  icon: IconName;
  /** Tile size in px. The icon scales with it. */
  size?: 36 | 40 | 44 | 52 | 56;
  className?: string;
  iconClassName?: string;
}

const SIZE: Record<NonNullable<IconTileProps["size"]>, { tile: string; icon: string }> = {
  36: { tile: "size-9 rounded-[9px]", icon: "size-[18px]" },
  40: { tile: "size-10 rounded-[10px]", icon: "size-5" },
  44: { tile: "size-11 rounded-xl", icon: "size-[22px]" },
  52: { tile: "size-13 rounded-[14px]", icon: "size-[22px]" },
  56: { tile: "size-14 rounded-[14px]", icon: "size-[26px]" },
};

/** Bordered square icon container used on cards, drop zones and headers. */
export function IconTile({ icon, size = 40, className, iconClassName }: IconTileProps) {
  const s = SIZE[size];
  const Icon = icons[icon];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center border border-border bg-surface-2 text-fg",
        s.tile,
        className,
      )}
      aria-hidden
    >
      <Icon className={cn(s.icon, iconClassName)} strokeWidth={1.75} />
    </div>
  );
}
