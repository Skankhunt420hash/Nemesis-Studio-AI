import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["monaco-editor", "@monaco-editor/react"],
  serverExternalPackages: ["node-pty"],
};

export default nextConfig;
