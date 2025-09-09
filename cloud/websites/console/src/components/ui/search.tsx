import * as React from "react";
import { SearchIcon, X } from "lucide-react";

import { cn } from "@/libs/utils";

interface SearchProps extends React.ComponentProps<"input"> {
  onClear?: () => void;
  showClearButton?: boolean;
  inputHint: string;
}

const Search = React.forwardRef<HTMLInputElement, SearchProps>(
  (
    { className, onClear, showClearButton = true, inputHint, ...props },
    ref,
  ) => {
    const [value, setValue] = React.useState(
      props.value || props.defaultValue || "",
    );

    const handleClear = () => {
      setValue("");
      onClear?.();
      if (props.onChange) {
        const event = {
          target: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>;
        props.onChange(event);
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
      props.onChange?.(e);
    };

    return (
      <div className="relative" style={{ flex: 1 }}>
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={ref}
          type="search"
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          value={value}
          onChange={handleChange}
          placeholder={props.placeholder ?? inputHint}
          {...props}
        />
      </div>
    );
  },
);

Search.displayName = "Search";

export { Search };
