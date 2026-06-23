import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ZipInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

const ZipInput = React.forwardRef<HTMLInputElement, ZipInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      // Only allow digits and limit to 5 characters
      const digits = inputValue.replace(/\D/g, "").slice(0, 5);
      onChange(digits);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow: backspace, delete, tab, escape, enter, arrows
      const allowedKeys = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
      if (allowedKeys.includes(e.key)) return;
      
      // Allow Ctrl/Cmd + A, C, V, X
      if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) return;
      
      // Block non-numeric keys
      if (!/^\d$/.test(e.key)) {
        e.preventDefault();
      }
      
      // Block if already 5 digits
      if (value.length >= 5 && /^\d$/.test(e.key)) {
        e.preventDefault();
      }
    };

    const isComplete = value.length === 5;

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={5}
          className={cn(
            "pr-10 transition-all",
            isComplete && "border-emerald-500/50 focus-visible:ring-emerald-500/50",
            className
          )}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          {...props}
        />
        <span className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors",
          isComplete ? "text-emerald-500" : "text-muted-foreground"
        )}>
          {value.length}/5
        </span>
      </div>
    );
  }
);

ZipInput.displayName = "ZipInput";

export { ZipInput };
