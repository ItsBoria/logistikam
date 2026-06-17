import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
  containerClassName?: string;
}

/**
 * Compact pill-shaped search input. Borderless, soft background, icon on the right (RTL).
 * Use everywhere a search box is needed in admin/shop screens for visual consistency.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, containerClassName, onClear, value, ...props }, ref) => {
    const showClear = !!onClear && typeof value === "string" && value.length > 0;
    return (
      <div className={cn("relative w-full max-w-[260px]", containerClassName)}>
        <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={ref}
          value={value}
          {...props}
          className={cn(
            "h-8 w-full rounded-full bg-muted/60 pr-8 pl-8 text-xs",
            "placeholder:text-muted-foreground/70 text-foreground",
            "border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring transition",
            className,
          )}
        />
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="נקה"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";
