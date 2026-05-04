import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["monaco-editor", "@monaco-editor/react"],
  serverExternalPackages: ["node-pty"],
};

export default nextConfig;
