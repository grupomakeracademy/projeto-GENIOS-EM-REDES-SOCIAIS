import 'server-only';
import { after } from 'next/server';
import { processRequestedJob } from './worker';

/** A finite task attached to the authenticated request; no generation polling. */
export function dispatchRequestedJob(id: string, workspaceId: string, actorId: string) {
  after(async () => {
    try {
      const result = await processRequestedJob(id, workspaceId, actorId);
      console.info('[Jobs] Request finished', { jobId: id, ...result });
    } catch {
      console.error('[Jobs] Request failed before completion', { jobId: id });
      // No silent retry. Expired requests become terminal on startup/status reads.
    }
  });
}
