import { useState } from "react";
import { Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ResponseViewDialogProps {
  title: string;
  data: Record<string, unknown> | null;
  variant: "ping" | "post";
}

export function ResponseViewDialog({ title, data, variant }: ResponseViewDialogProps) {
  const [open, setOpen] = useState(false);

  if (!data) {
    return <span className="text-muted-foreground">—</span>;
  }

  const variantStyles = {
    ping: {
      button: "text-blue-400 hover:text-blue-300 hover:bg-blue-500/20",
      header: "bg-blue-500/10 border-b border-blue-500/20",
      content: "bg-blue-500/5",
    },
    post: {
      button: "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20",
      header: "bg-emerald-500/10 border-b border-emerald-500/20",
      content: "bg-emerald-500/5",
    },
  };

  const styles = variantStyles[variant];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 w-8 p-0", styles.button)}
        >
          <Eye className="h-4 w-4" />
          <span className="sr-only">View {title}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader className={cn("rounded-t-lg -m-6 mb-4 p-4", styles.header)}>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className={cn("rounded-lg p-4 overflow-auto max-h-[60vh]", styles.content)}>
          <pre className="text-sm whitespace-pre-wrap break-words">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
