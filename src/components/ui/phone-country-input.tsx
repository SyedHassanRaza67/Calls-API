import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRIES, flagEmoji, type Country } from "@/lib/countries";

export interface PhoneCountryInputProps {
  value: string;
  onChange: (e164: string) => void;
  id?: string;
  className?: string;
}

const MAX_E164_DIGITS = 15;

const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.iso2 === "US") ?? COUNTRIES[0];

const onlyDigits = (s: string): string => s.replace(/\D/g, "");

/**
 * Given the full E.164 digit string and a candidate dial code, return the
 * national digits if the dial code is a prefix, otherwise null.
 */
function stripDial(allDigits: string, dial: string): string | null {
  if (allDigits.startsWith(dial)) return allDigits.slice(dial.length);
  return null;
}

const PhoneCountryInput = React.forwardRef<HTMLInputElement, PhoneCountryInputProps>(
  ({ value, onChange, id, className }, ref) => {
    const [open, setOpen] = React.useState(false);
    // The selected country is tracked internally because dial codes are not
    // unique (e.g. +1 is shared). It defaults to US.
    const [selectedIso, setSelectedIso] = React.useState<string>(DEFAULT_COUNTRY.iso2);

    const selectedCountry =
      COUNTRIES.find((c) => c.iso2 === selectedIso) ?? DEFAULT_COUNTRY;

    const allDigits = onlyDigits(value);

    // Derive the national portion from the controlled E.164 value by removing
    // the selected country's dial prefix. Fall back to the full digit string.
    const nationalDigits = React.useMemo(() => {
      const stripped = stripDial(allDigits, selectedCountry.dial);
      return stripped ?? "";
    }, [allDigits, selectedCountry.dial]);

    const emit = (dial: string, national: string) => {
      const dialDigits = onlyDigits(dial);
      let nat = onlyDigits(national);
      // Enforce total E.164 length (dial + national) <= 15 digits.
      const room = Math.max(0, MAX_E164_DIGITS - dialDigits.length);
      nat = nat.slice(0, room);
      onChange(`+${dialDigits}${nat}`);
    };

    const handleSelectCountry = (country: Country) => {
      setSelectedIso(country.iso2);
      setOpen(false);
      emit(country.dial, nationalDigits);
    };

    const handleNationalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      emit(selectedCountry.dial, e.target.value);
    };

    return (
      <div className={cn("flex gap-2", className)}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Select country calling code"
              className="h-10 shrink-0 justify-between gap-1 px-3 font-normal"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-base leading-none">
                  {flagEmoji(selectedCountry.iso2)}
                </span>
                <span className="text-sm">+{selectedCountry.dial}</span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[280px] p-0" align="start">
            <Command
              filter={(itemValue, search) => {
                // itemValue is the searchable string we set on each CommandItem.
                return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Search country or code..." />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {COUNTRIES.map((country) => (
                    <CommandItem
                      key={country.iso2}
                      value={`${country.name} +${country.dial} ${country.iso2}`}
                      onSelect={() => handleSelectCountry(country)}
                    >
                      <span className="mr-2 text-base leading-none">
                        {flagEmoji(country.iso2)}
                      </span>
                      <span className="flex-1 truncate">{country.name}</span>
                      <span className="ml-2 text-muted-foreground">+{country.dial}</span>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4",
                          country.iso2 === selectedCountry.iso2
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          ref={ref}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="555 123 4567"
          value={nationalDigits}
          onChange={handleNationalChange}
        />
      </div>
    );
  },
);

PhoneCountryInput.displayName = "PhoneCountryInput";

export { PhoneCountryInput };
