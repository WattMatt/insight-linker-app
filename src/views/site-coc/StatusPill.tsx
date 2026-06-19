import { cn } from "@/lib/utils";
import { TONE_PILL, type Tone } from "@/lib/siteCoc/statusDisplay";

export function StatusPill({ tone, label, title, className }: { tone: Tone; label: string; title?: string; className?: string }) {
  return (
    <span
      title={title ?? label}
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_PILL[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
