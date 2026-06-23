import { Clock } from "lucide-react";
import { useDuplicateCid } from "@/hooks/useDuplicateCid";

interface Props {
  callerNumber: string;
  className?: string;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function DuplicateCidNotice({ callerNumber, className }: Props) {
  const { matches } = useDuplicateCid(callerNumber);
  if (!matches.length) return null;

  return (
    <div
      className={
        "rounded-md border border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-100 px-2.5 py-1.5 text-[11px] space-y-0.5 " +
        (className || "")
      }
    >
      <div className="flex items-center gap-1.5 font-medium">
        <Clock className="h-3 w-3 flex-shrink-0" />
        This CID Previously Used:
      </div>
      <ul className="space-y-0.5">
        {matches.slice(0, 10).map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span className="font-semibold truncate">{m.campaignName}</span>
            <span className="opacity-70 whitespace-nowrap">{relTime(m.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
