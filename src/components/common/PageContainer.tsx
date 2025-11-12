import type {
  ComponentPropsWithoutRef,
  ElementType,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type PageContainerProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<T>;

export function PageContainer<T extends ElementType = "section">({
  as,
  children,
  className,
  ...rest
}: PageContainerProps<T>) {
  const Component = as ?? "section";

  return (
    <Component
      className={cn(
        "mx-auto w-full max-w-5xl px-6 py-16 md:px-10 lg:max-w-6xl",
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}
