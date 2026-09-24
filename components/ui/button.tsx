"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Mirrors the Figma component set `Button` (Style × Size × State).
 * Hover and pressed are not Figma variants — they live here, on the
 * accent-hover / accent-pressed tokens.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-sm rounded-sm",
    "font-medium whitespace-nowrap select-none",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:shadow-focus",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      styleVariant: {
        primary: "bg-accent text-fg hover:bg-accent-hover active:bg-accent-pressed",
        secondary:
          "bg-elevated text-fg border border-line-strong hover:bg-hovered active:bg-elevated",
        ghost: "bg-transparent text-fg-secondary hover:bg-hovered hover:text-fg",
        danger: "bg-danger text-fg-inverse hover:opacity-90 active:opacity-80",
      },
      size: {
        sm: "h-8 px-md text-xs",
        md: "h-10 px-lg text-sm",
        lg: "h-12 px-xl text-sm",
      },
      block: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: { styleVariant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, styleVariant, size, block, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(button({ styleVariant, size, block }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
