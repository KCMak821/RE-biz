const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

function hasExited(childProcess) {
  return (
    childProcess.exitCode !== null || childProcess.signalCode !== null
  );
}

function waitForExit(childProcess, timeoutMs) {
  if (hasExited(childProcess)) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    let timeout;

    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      childProcess.removeListener("exit", onExit);
      childProcess.removeListener("error", onError);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const onError = () => finish(true);

    childProcess.once("exit", onExit);
    childProcess.once("error", onError);
    timeout = setTimeout(() => finish(false), timeoutMs);
    timeout.unref?.();

    if (hasExited(childProcess)) finish(true);
  });
}

function sendSignal(childProcess, signal) {
  try {
    return childProcess.kill(signal);
  } catch {
    return false;
  }
}

export async function stopChildProcess(
  childProcess,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
) {
  if (!childProcess || hasExited(childProcess)) return true;

  const gracefulExit = waitForExit(childProcess, timeoutMs);
  sendSignal(childProcess, "SIGTERM");
  if (await gracefulExit) return true;

  if (hasExited(childProcess)) return true;
  const forcedExit = waitForExit(childProcess, timeoutMs);
  sendSignal(childProcess, "SIGKILL");
  return forcedExit;
}
