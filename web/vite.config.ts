import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { createCodexBridgeMiddleware } from "./src/server/codexAppServerBridge";
import express from "express";
import type { Server } from "node:http";
import { createLocalFileRouter } from "./src/server/localFileRoutes";
import { requestPolicy } from "./src/server/requestPolicy";
import { isDirectLocalRequest } from "./src/server/authMiddleware";
import { attachNotificationsWebSocket } from "./src/server/webSocket";
import tailwindcss from "@tailwindcss/vite";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

function getWorktreeName(): string {
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  const segments = normalizedCwd.split("/").filter(Boolean);
  const worktreesIndex = segments.lastIndexOf("worktrees");
  if (worktreesIndex >= 0 && worktreesIndex + 1 < segments.length) {
    return segments[worktreesIndex + 1];
  }

  const gitDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (gitDir.status === 0) {
    const resolvedGitDir = gitDir.stdout.trim().replace(/\\/g, "/");
    const worktreeMarker = "/.git/worktrees/";
    const markerIndex = resolvedGitDir.indexOf(worktreeMarker);
    if (markerIndex >= 0) {
      const worktreeSegments = resolvedGitDir.slice(markerIndex + worktreeMarker.length).split("/").filter(Boolean);
      if (worktreeSegments.length > 0) {
        return worktreeSegments[0] ?? "unknown";
      }
    }
  }

  const gitCommonDir = spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (gitCommonDir.status === 0) {
    const resolvedGitCommonDir = gitCommonDir.stdout.trim().replace(/\\/g, "/");
    if (resolvedGitCommonDir.endsWith("/.git")) {
      const commonDirSegments = resolvedGitCommonDir.split("/").filter(Boolean);
      if (commonDirSegments.length >= 2) {
        return commonDirSegments[commonDirSegments.length - 2] ?? "unknown";
      }
    }
  }

  return segments[segments.length - 1] ?? "unknown";
}

const worktreeName = getWorktreeName();
const appVersion = readFileSync(new URL("../tray/TrayApp.cs", import.meta.url), "utf8")
  .match(/internal const string Version = "([^"]+)";/u)?.[1];
if (!appVersion) throw new Error("Missing tray version for the web build");

function readEnvValueFromFile(filePath: string, key: string): string {
  if (!existsSync(filePath)) return "";
  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const currentKey = trimmed.slice(0, separator).trim();
    if (currentKey !== key) continue;
    return trimmed.slice(separator + 1).trim();
  }
  return "";
}

function resolveViteRollbackDebugFallback(): string {
  const fromEnvLocal = readEnvValueFromFile(".env.local", "VITE_ROLLBACK_DEBUG");
  if (fromEnvLocal) return fromEnvLocal;
  return readEnvValueFromFile(".env", "VITE_ROLLBACK_DEBUG");
}

const viteRollbackDebugFallback = resolveViteRollbackDebugFallback();

export default defineConfig({
  define: {
    "import.meta.env.VITE_WORKTREE_NAME": JSON.stringify(worktreeName),
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.CODEX_WEB_BUILD_VERSION || appVersion),
    "import.meta.env.VITE_ROLLBACK_DEBUG_FALLBACK": JSON.stringify(viteRollbackDebugFallback),
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: ["localhost", "127.0.0.1"],
    watch: {
      ignored: [
        '**/.omx/**',
        '**/.cursor/**',
        '**/.playwright-cli/**',
        '**/dist/**',
        '**/dist-cli/**',
      ],
    },
  },
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: "codex-bridge",
      configureServer(server) {
        const bridge = createCodexBridgeMiddleware();
        const app = express();
        app.use((req, res, next) => { if (!isDirectLocalRequest(req)) { res.status(403).end("Development access is local only."); return; } next(); });
        app.use(requestPolicy);
        app.use(createLocalFileRouter());
        app.use(bridge);
        server.middlewares.use(app);
        const closeSocket = server.httpServer ? attachNotificationsWebSocket(server.httpServer as Server, bridge.subscribeNotifications, isDirectLocalRequest) : () => {};
        server.httpServer?.once("close", () => { closeSocket(); bridge.dispose(); });

      },
    },
  ],
});
