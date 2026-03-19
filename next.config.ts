import type { NextConfig } from "next";
import nextra from "nextra";

const withNextra = nextra({});

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "next-mdx-import-source-file": "./mdx-components.tsx",
    },
  },
};

export default withNextra(nextConfig);
