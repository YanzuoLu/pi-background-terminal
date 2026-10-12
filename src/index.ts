import { truncateLine, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { manager, sweepOrphanLogs, type BackgroundTask } from "./background/manager.js";
import { registerBackgroundCommand } from "./background-command.js";
import { registerBackgroundKillTool } from "./tools/background-kill.js";
import { registerBackgroundStatusTool } from "./tools/background-status.js";
import { registerBackgroundRunTool } from "./tools/background-run.js";

export default function registerBackgroundTerminal(pi: ExtensionAPI): void {
  // Crash paths (uncaughtException, terminal EIO) never fire session_shutdown, so logs
  // from those sessions survive on disk. Sweep stale ones on every load (startup + /reload).
  sweepOrphanLogs();

  let currentSessionId: string | null = null;
  let updateStatus: (() => void) | undefined;

  manager.init(
    (task) => {
      if (!currentSessionId || task.parentSessionId !== currentSessionId) return;
      // The exit is reported as soon as it happens, so nothing has to poll background_status to
      // notice completion. While the agent is working it is steered into the current turn,
      // before the next model request; an idle agent is woken into a new turn.
      pi.sendMessage(
        {
          customType: "background-exit",
          content: formatExitMessage(task),
          display: true,
          details: task,
        },
        { deliverAs: "steer", triggerTurn: true },
      );
    },
    () => updateStatus?.(),
  );

  registerBackgroundCommand(pi);
  // No foreground-timeout hook here: the inject-and-clamp for bash/powershell lives in
  // the separate small-extensions/pi-bash-timeout extension (BYTE-10, GitHub #3) so an
  // install of this package contains no hook source at all. background_run still keys
  // its lifetime guard on the shared shell-timeout.ts constants below.
  registerBackgroundRunTool(pi);
  registerBackgroundStatusTool(pi);
  registerBackgroundKillTool(pi);

  pi.on("session_start", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    currentSessionId = sessionId;
    updateStatus = () => {
      const running = manager.list(sessionId).filter((task) => task.status === "running").length;
      ctx.ui.setStatus("background-terminal", running === 0 ? undefined : `bg:${running}`);
    };
    updateStatus();
  });

  pi.on("session_shutdown", async (event, ctx) => {
    // "reload" re-fires session_shutdown/session_start on the SAME session (extensions and config
    // hot-reload), it does not end the session. Background tasks must survive a /reload.
    if (event.reason === "reload") return;

    const sessionId = ctx.sessionManager.getSessionId();
    ctx.ui.setStatus("background-terminal", undefined);
    updateStatus = undefined;
    if (currentSessionId === sessionId) currentSessionId = null;
    await manager.clearSession(sessionId);
  });
}

function formatExitMessage(task: BackgroundTask): string {
  const outcome =
    task.status === "killed"
      ? "was stopped"
      : task.status === "timed_out"
        ? `timed out after ${task.timeoutSeconds} seconds (restart with background_run to renew it)`
        : task.status === "failed"
          ? `failed: ${task.error ?? "unknown error"}`
          : `exited with code ${task.exitCode}`;
  const lastLine = task.tail.trim().split("\n").at(-1);
  const summary = lastLine ? ` Last line: ${truncateLine(lastLine, 250).text}` : "";
  return `[${task.id}] ${task.command} ${outcome}.${summary} Output: ${task.outputPath}`;
}
