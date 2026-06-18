import type { NextConfig } from "next";
import os from "os";

const nextConfig: NextConfig = {
  // Shared hosting often reports many CPUs but hangs/OOMs when Next spawns one worker per core.
  experimental: {
    cpus: Math.min(4, os.cpus().length || 1),
  },
  async rewrites() {
    return [
      {
        source: "/CardGame/v/:version/Build/:path*",
        destination: "/CardGame/Build/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/CardGame/v/:version/Build/CardGame.framework.js.br",
        headers: [
          { key: "Content-Type", value: "application/javascript" },
          { key: "Content-Encoding", value: "br" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/v/:version/Build/CardGame.wasm.br",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Content-Encoding", value: "br" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/v/:version/Build/CardGame.data.br",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
          { key: "Content-Encoding", value: "br" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/Build/CardGame.framework.js.br",
        headers: [
          { key: "Content-Type", value: "application/javascript" },
          { key: "Content-Encoding", value: "br" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/Build/CardGame.wasm.br",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Content-Encoding", value: "br" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/Build/CardGame.data.br",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
          { key: "Content-Encoding", value: "br" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/Build/CardGame.framework.js",
        headers: [
          { key: "Content-Type", value: "application/javascript" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/Build/CardGame.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/CardGame/Build/CardGame.data",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
