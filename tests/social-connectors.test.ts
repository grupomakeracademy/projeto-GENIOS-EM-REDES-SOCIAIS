import { describe, it, expect, vi } from 'vitest';
import {
  connectors,
  InstagramConnector,
  FacebookConnector,
  LinkedInConnector,
  XConnector,
} from '@/lib/social/connectors';
import { encrypt, decrypt } from '@/lib/security/crypto';

describe('Social Connectors and Publishing', () => {
  it('all channels have operational publishing capabilities', () => {
    for (const [channel, connector] of Object.entries(connectors)) {
      const caps = connector.capabilities();
      expect(caps.canPublish, `Channel ${channel} should allow publishing`).toBe(true);
      expect(caps.canSchedule, `Channel ${channel} should allow scheduling`).toBe(true);
      expect(caps.canGenerate, `Channel ${channel} should allow generation`).toBe(true);
    }
  });

  describe('Instagram Connector', () => {
    const ig = new InstagramConnector();

    it('simulates single image publish when in demo mode', async () => {
      const result = await ig.publish({
        caption: 'Post de teste no Instagram',
        mediaUrls: ['https://example.com/image1.png'],
        channel: 'instagram',
        token: 'demo_token',
      });

      expect(result.success).toBe(true);
      expect(result.externalPostId).toContain('ig_');
      expect(result.externalPostUrl).toContain('https://instagram.com/p/');
      expect(result.publishedAt).toBeDefined();
    });

    it('simulates carousel publish when multiple images are provided in demo mode', async () => {
      const result = await ig.publish({
        caption: 'Carrossel de teste no Instagram',
        mediaUrls: [
          'https://example.com/image1.png',
          'https://example.com/image2.png',
          'https://example.com/image3.png',
        ],
        channel: 'instagram',
        token: 'test_token',
      });

      expect(result.success).toBe(true);
      expect(result.externalPostId).toContain('ig_');
      expect(result.externalPostUrl).toContain('https://instagram.com/p/');
    });
  });

  describe('Facebook Connector', () => {
    const fb = new FacebookConnector();

    it('simulates page post in demo mode', async () => {
      const result = await fb.publish({
        caption: 'Post de teste no Facebook',
        mediaUrls: ['https://example.com/image1.png'],
        channel: 'facebook',
        token: 'demo_token',
      });

      expect(result.success).toBe(true);
      expect(result.externalPostId).toContain('fb_');
      expect(result.externalPostUrl).toContain('https://facebook.com/');
    });
  });

  describe('LinkedIn Connector', () => {
    const li = new LinkedInConnector();

    it('simulates LinkedIn share in demo mode', async () => {
      const result = await li.publish({
        caption: 'Artigo ou post no LinkedIn',
        mediaUrls: ['https://example.com/image1.png'],
        channel: 'linkedin',
        token: 'demo_token',
      });

      expect(result.success).toBe(true);
      expect(result.externalPostId).toContain('urn:li:share:');
      expect(result.externalPostUrl).toContain('https://linkedin.com/feed/update/');
    });
  });

  describe('X (Twitter) Connector', () => {
    const x = new XConnector();

    it('simulates tweet in demo mode', async () => {
      const result = await x.publish({
        caption: 'Tweet de teste automático',
        mediaUrls: ['https://example.com/image1.png'],
        channel: 'x',
        token: 'demo_token',
      });

      expect(result.success).toBe(true);
      expect(result.externalPostId).toContain('tweet_');
      expect(result.externalPostUrl).toContain('https://x.com/user/status/');
    });
  });

  describe('Credential Encryption for Social Tokens', () => {
    it('encrypts and decrypts social token with workspace AAD', () => {
      process.env.CREDENTIAL_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
      const workspaceId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      const rawToken = 'EAABsbCS1...real_meta_token';
      const ciphertext = encrypt(rawToken, workspaceId);

      expect(ciphertext).not.toBe(rawToken);
      expect(ciphertext).toContain('.');

      const decrypted = decrypt(ciphertext, workspaceId);
      expect(decrypted).toBe(rawToken);
    });
  });
});

it.each(['feed','stories','feed_and_stories'] as const)('publishes original video for supported Instagram %s destinations',async destination=>{
 const calls:{url:string;body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch',vi.fn(async (url:string,options?:RequestInit)=>{
 const body=options?.body?JSON.parse(String(options.body)):{};
 calls.push({url,body});
 return {ok:true,json:async()=>url.includes('fields=status_code')?{status_code:'FINISHED'}:{id:'official-media-id'}};
 }));
 const result=await new InstagramConnector().publish({caption:'Original video',mediaUrls:['https://example.test/original.mp4'],mediaType:'video',channel:'instagram',token:'official-token',externalId:'business-id',destination});
 expect(result.success).toBe(true);
 const containers=calls.filter(c=>c.url.endsWith('/media'));
 expect(containers).toHaveLength(destination==='feed_and_stories'?2:1);
 expect(containers.every(c=>c.body.video_url==='https://example.test/original.mp4' && !c.body.image_url)).toBe(true);
 expect(containers.map(c=>c.body.media_type)).toEqual(destination==='feed_and_stories'?['REELS','STORIES']:[destination==='feed'?'REELS':'STORIES']);
 vi.unstubAllGlobals();
});
