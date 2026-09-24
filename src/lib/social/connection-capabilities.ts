import { connectors, type Capabilities } from './connectors';
import type { Channel } from '../domain';

export function connectionCapabilities(channel: Channel, metadata?: Record<string, unknown> | null): Capabilities {
  const caps = connectors[channel].capabilities();
  if (String(metadata?.connected_via || '').startsWith('demo')) return { ...caps, canPublish:false, canSchedule:false, videoDestinations:[] };
  // Instagram Stories are restricted to business accounts. Legacy/unknown types
  // can still publish Reels, but must be reconnected before offering video Stories.
  const videoDestinations = channel === 'instagram' && metadata?.account_type !== 'BUSINESS'
    ? (caps.videoDestinations || []).filter(d => d === 'feed') : caps.videoDestinations || [];
  return { ...caps, videoDestinations };
}
