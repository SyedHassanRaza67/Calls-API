import { AlertTriangle } from "lucide-react";
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

  const lastSeen = matches[0]?.createdAt;

  return (
    <div
      className={
        "rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100 px-3 py-2 text-xs space-y-1 " +
        (className || "")
      }
    >
      <div className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" />
        This CID was previously routed to:
        {lastSeen && <span className="ml-auto opacity-70">last: {relTime(lastSeen)}</span>}
      </div>
      <ul className="pl-5 list-disc space-y-0.5">
        {matches.slice(0, 10).map((m, i) => (
          <li key={i} className="break-all">
            <span className="font-semibold">{m.campaignName}</span>
            <span className="opacity-70"> → </span>
            <span className="font-mono">{m.did}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
