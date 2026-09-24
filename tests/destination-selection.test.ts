import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import {
  destinations,
  destinationSchema,
  getChannelDestinations,
  getChannelsDestinations,
  routineSettingsSchema,
  type Channel,
  type Destination,
} from '@/lib/domain';
import { connectors } from '@/lib/social/connectors';

describe('Destination Selection - Domain & Capabilities', () => {
  it('defines the three official publication destinations', () => {
    expect(destinations.feed.label).toBe('Feed');
    expect(destinations.stories.label).toBe('Stories');
    expect(destinations.feed_and_stories.label).toBe('Feed e Stories');

    expect(destinationSchema.safeParse('feed').success).toBe(true);
    expect(destinationSchema.safeParse('stories').success).toBe(true);
    expect(destinationSchema.safeParse('feed_and_stories').success).toBe(true);
    expect(destinationSchema.safeParse('reels').success).toBe(false);
  });

  it('respects real channel capabilities for individual networks', () => {
    // Networks that support Feed and Stories (Instagram and Facebook)
    expect(getChannelDestinations('instagram')).toEqual(['feed', 'stories', 'feed_and_stories']);
    expect(getChannelDestinations('facebook')).toEqual(['feed', 'stories', 'feed_and_stories']);

    // Networks that support only Feed
    expect(getChannelDestinations('linkedin')).toEqual(['feed']);
    expect(getChannelDestinations('x')).toEqual(['feed']);
    expect(getChannelDestinations('tiktok')).toEqual(['feed']);
    expect(getChannelDestinations('whatsapp')).toEqual(['feed']);
  });

  it('reflects correct connector capabilities', () => {
    const igCaps = connectors.instagram.capabilities();
    expect(igCaps.canPublishFeed).toBe(true);
    expect(igCaps.canPublishStories).toBe(true);
    expect(igCaps.supportedDestinations).toEqual(['feed', 'stories', 'feed_and_stories']);

    const fbCaps = connectors.facebook.capabilities();
    expect(fbCaps.canPublishFeed).toBe(true);
    expect(fbCaps.canPublishStories).toBe(true);
    expect(fbCaps.supportedDestinations).toEqual(['feed', 'stories', 'feed_and_stories']);

    const liCaps = connectors.linkedin.capabilities();
    expect(liCaps.canPublishFeed).toBe(true);
    expect(liCaps.canPublishStories).toBe(false);
    expect(liCaps.supportedDestinations).toEqual(['feed']);

    const xCaps = connectors.x.capabilities();
    expect(xCaps.canPublishFeed).toBe(true);
    expect(xCaps.canPublishStories).toBe(false);
    expect(xCaps.supportedDestinations).toEqual(['feed']);
  });

  it('dynamically adapts destinations for multiple channels in AI Routine', () => {
    // Only feed channels selected -> only feed available
    const onlyFeed: Channel[] = ['linkedin', 'x'];
    expect(getChannelsDestinations(onlyFeed)).toEqual(['feed']);

    // If any selected channel supports stories -> feed, stories, feed_and_stories available
    const withInstagram: Channel[] = ['linkedin', 'instagram'];
    expect(getChannelsDestinations(withInstagram)).toEqual(['feed', 'stories', 'feed_and_stories']);

    // When stories-capable channel is removed -> only feed
    const removedIg = withInstagram.filter((c) => c !== 'instagram');
    expect(getChannelsDestinations(removedIg)).toEqual(['feed']);
  });

  it('persists destination in routine_settings schema with default feed', () => {
    const defaultRs = routineSettingsSchema.parse({});
    expect(defaultRs.destination).toBe('feed');

    const storiesRs = routineSettingsSchema.parse({ destination: 'stories' });
    expect(storiesRs.destination).toBe('stories');

    const bothRs = routineSettingsSchema.parse({ destination: 'feed_and_stories' });
    expect(bothRs.destination).toBe('feed_and_stories');
  });

  it('executes demo publish with destination without errors', async () => {
    const resFeed = await connectors.instagram.publish({
      caption: 'Teste Feed',
      mediaUrls: ['https://example.com/test.jpg'],
      channel: 'instagram',
      destination: 'feed',
    });
    expect(resFeed.success).toBe(true);

    const resStories = await connectors.instagram.publish({
      caption: 'Teste Stories',
      mediaUrls: ['https://example.com/test.jpg'],
      channel: 'instagram',
      destination: 'stories',
    });
    expect(resStories.success).toBe(true);

    const resBoth = await connectors.instagram.publish({
      caption: 'Teste Feed e Stories',
      mediaUrls: ['https://example.com/test.jpg'],
      channel: 'instagram',
      destination: 'feed_and_stories',
    });
    expect(resBoth.success).toBe(true);
  });
});
