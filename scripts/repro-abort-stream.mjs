const controller = new AbortController();

const url = process.argv[2];
const cookie = process.argv[3] ?? "";

if (!url) {
  throw new Error("Usage: node scripts/repro-abort-stream.mjs <url> [cookie]");
}

const response = await fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
  },
  body: JSON.stringify({
    message: "Abort-path verification run for METIS streaming.",
  }),
  signal: controller.signal,
});

if (!response.ok) {
  const text = await response.text();
  throw new Error(`Request failed with ${response.status}: ${text}`);
}

const reader = response.body?.getReader();
if (!reader) {
  throw new Error("Response body is not readable.");
}

const firstChunk = await reader.read();
if (firstChunk.done) {
  throw new Error("Stream ended before the first event.");
}

console.log(Buffer.from(firstChunk.value).toString("utf8"));
controller.abort();

try {
  await reader.read();
} catch (error) {
  console.log(`Reader stopped after abort: ${error instanceof Error ? error.message : String(error)}`);
}
