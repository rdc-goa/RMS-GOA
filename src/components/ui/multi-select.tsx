"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

interface MultiSelectProps {
  options: { label: string; value: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = "Select options...",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const handleToggle = (value: string) => {
    const isSelected = selectedValues.includes(value);
    if (isSelected) {
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex min-h-10 w-[240px] items-center justify-between rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <div className="flex flex-wrap gap-1 items-center max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
            {selectedValues.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : selectedValues.length > 1 ? (
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="rounded-sm px-1.5 py-0.5 text-xs font-normal">
                  {options.find((o) => o.value === selectedValues[0])?.label || selectedValues[0]}
                </Badge>
                <Badge variant="secondary" className="rounded-sm px-1.5 py-0.5 text-xs font-normal bg-primary/10 text-primary border-primary/20">
                  +{selectedValues.length - 1} more
                </Badge>
              </div>
            ) : (
              <Badge variant="secondary" className="rounded-sm px-1.5 py-0.5 text-xs font-normal">
                {options.find((o) => o.value === selectedValues[0])?.label || selectedValues[0]}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {selectedValues.length > 0 && (
              <X
                className="h-3.5 w-3.5 shrink-0 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
                onClick={handleClear}
              />
            )}
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="flex flex-col h-full max-h-[300px]">
          <div className="p-2">
            <Input
              placeholder="Search types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <Separator />
          <div className="flex-1 overflow-y-auto p-1 space-y-0.5 max-h-[220px]">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No claim types found.
              </div>
            ) : (
              <>
                <div
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 font-medium text-primary"
                  onClick={() => onChange([])}
                >
                  <Checkbox
                    checked={selectedValues.length === 0}
                    className="mr-2 h-3.5 w-3.5"
                    onCheckedChange={() => onChange([])}
                  />
                  <span>All Claim Types</span>
                </div>
                <Separator className="my-1" />
                {filteredOptions.map((option) => {
                  const isChecked = selectedValues.includes(option.value);
                  return (
                    <div
                      key={option.value}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground transition-colors",
                        isChecked && "bg-accent/40 font-medium"
                      )}
                      onClick={() => handleToggle(option.value)}
                    >
                      <Checkbox
                        checked={isChecked}
                        className="mr-2 h-3.5 w-3.5"
                        onCheckedChange={() => handleToggle(option.value)}
                      />
                      <span className="flex-1 truncate">{option.label}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
