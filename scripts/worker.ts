let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
async function main() {
  if (!process.env.APP_ORIGIN || !process.env.WORKER_SECRET)
    throw new Error('Worker environment is not configured');
  while (!stopping) {
    try {
      const response = await fetch(`${process.env.APP_ORIGIN}/api/jobs/tick`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.WORKER_SECRET}` },
        signal: AbortSignal.timeout(30 * 60 * 1000),
      });
      if (!response.ok) console.error('Worker request failed:', response.status);
      else {
        const result = await response.json();
        if (result.processed)
          console.log(
            JSON.stringify({ id: result.id, status: result.status, error: result.error }),
          );
      }
    } catch {
      console.error('Worker connection unavailable');
    }
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
void main();
