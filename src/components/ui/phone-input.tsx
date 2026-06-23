import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
}

const formatPhoneNumber = (value: string): string => {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");
  
  // Limit to 10 digits
  const limited = digits.slice(0, 10);
  
  // Format as (XXX) XXX-XXXX
  if (limited.length === 0) return "";
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
};

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, value, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;
      const digits = inputValue.replace(/\D/g, "");
      
      // Only allow up to 10 digits
      if (digits.length <= 10) {
        onChange(formatPhoneNumber(inputValue));
      }
    };

    // Show character count indicator
    const digitCount = value.replace(/\D/g, "").length;
    const isComplete = digitCount === 10;

    return (
      <div className="relative">
        <Input
          ref={ref}
          type="tel"
          inputMode="numeric"
          className={cn(
            "pr-12 transition-all",
            isComplete && "border-emerald-500/50 focus-visible:ring-emerald-500/50",
            className
          )}
          value={value}
          onChange={handleChange}
          {...props}
        />
        <span className={cn(
          "absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors",
          isComplete ? "text-emerald-500" : "text-muted-foreground"
        )}>
          {digitCount}/10
        </span>
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
