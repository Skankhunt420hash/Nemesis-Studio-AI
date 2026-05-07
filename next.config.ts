import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["monaco-editor", "@monaco-editor/react"],
  serverExternalPackages: ["node-pty"],
  turbopack: {
    /** Projektroot (npm aus diesem Ordner); dämpft „mehrere Lockfiles“-Warnung im Elternordner */
    root: path.resolve(process.cwd()),
  },
};

export default nextConfig;
