/*
 * Tesseract.js 7 does not await the asynchronous Core() bootstrap inside its
 * browser worker. If WebAssembly initialization rejects, the normal worker
 * response channel never receives that failure and createWorker can hang.
 * Forward that rejection through the packet shape expected by Tesseract.js so
 * the scanner can show the actual error, discard the worker, and allow retry.
 */
let pendingBootstrapJob = null;

self.addEventListener("message", ({ data }) => {
  if (data?.action === "load") {
    pendingBootstrapJob = {
      workerId: data.workerId,
      jobId: data.jobId,
      action: data.action,
    };
  } else if (pendingBootstrapJob) {
    // createWorker sends loadLanguage only after the core bootstrap resolves.
    pendingBootstrapJob = null;
  }
});

self.addEventListener("unhandledrejection", (event) => {
  if (!pendingBootstrapJob) return;
  event.preventDefault();
  const failure = event.reason instanceof Error
    ? event.reason.message
    : String(event.reason || "Unknown WebAssembly initialization error");
  self.postMessage({
    ...pendingBootstrapJob,
    status: "reject",
    data: `WebAssembly initialization failed: ${failure}`,
  });
  pendingBootstrapJob = null;
  self.close();
});

self.importScripts("./worker.min.js");
