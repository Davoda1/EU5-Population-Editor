// Register immediately after launch: Playwright disposes its process handle when
// Electron closes, and a later close listener would miss that event entirely.
export function createDesktopCleanup(app) {
  let closed = false;
  const didClose = new Promise((resolve) => {
    app.once("close", () => {
      closed = true;
      resolve();
    });
  });
  return async () => {
    if (closed) return;
    let timer;
    try {
      await Promise.race([
        (async () => {
          // Test cleanup must bypass interactive unsaved-work decisions. The
          // connection may disappear while this request is being delivered.
          await app.evaluate(({ app }) => {
            setImmediate(() => app.exit(0));
          }).catch(() => {});
          await didClose;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Electron test cleanup timed out")), 30000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}
