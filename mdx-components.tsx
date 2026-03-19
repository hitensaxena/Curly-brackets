import type { MDXComponents } from "nextra/mdx-components";
import { useMDXComponents as getNextraMDXComponents } from "nextra/mdx-components";

export function useMDXComponents(components?: MDXComponents): MDXComponents {
  const defaultComponents = getNextraMDXComponents();

  return {
    ...defaultComponents,
    ...components,
  };
}
