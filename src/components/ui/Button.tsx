import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

type BaseProps = {
  children: ReactNode;
  className?: string;
  variant?: Variant;
  size?: Size;
};

type ButtonAsButton = BaseProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLink = BaseProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-[color:var(--color-text-strong)] text-white hover:bg-[color:var(--color-text-secondary)]",
  secondary:
    "border border-[color:var(--color-text-strong)] bg-white text-[color:var(--color-text-strong)] hover:bg-[color:var(--color-accent-highlight)]/50",
  ghost:
    "text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-strong)]",
};

const sizeStyles: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    className,
    children,
    ...rest
  } = props;

  const classes = cn(
    "inline-flex items-center justify-center rounded-full font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500",
    variantStyles[variant],
    sizeStyles[size],
    className,
  );

  if ("href" in props && props.href) {
    const linkProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <Link {...linkProps} href={props.href} className={classes}>
        {children}
      </Link>
    );
  }

  const { type, ...buttonProps } = rest as ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <button type={type ?? "button"} className={classes} {...buttonProps}>
      {children}
    </button>
  );
}
