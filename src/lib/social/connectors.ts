import { type Channel } from '@/lib/domain';
export type Capabilities = {
  canGenerate: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canReadAnalytics: boolean;
  reason: string;
};
export interface SocialAnalyticsProvider {
  getAnalytics(): Promise<Record<string, number | null>>;
}
export interface SocialConnector extends SocialAnalyticsProvider {
  capabilities(): Capabilities;
  connect(): Promise<never>;
  disconnect(): Promise<void>;
  refreshToken(): Promise<never>;
  validate(): Promise<boolean>;
  publish(): Promise<never>;
  getPublicationStatus(): Promise<string>;
}
// Generation/export are operational. Official OAuth apps must be implemented and verified before enabling publication.
export class ManualExportConnector implements SocialConnector {
  constructor(readonly channel: Channel) {}
  capabilities() {
    return {
      canGenerate: true,
      canPublish: false,
      canSchedule: false,
      canReadAnalytics: false,
      reason: 'official_integration_required',
    };
  }
  async connect(): Promise<never> {
    throw new Error('unsupported_capability');
  }
  async disconnect() {}
  async refreshToken(): Promise<never> {
    throw new Error('unsupported_capability');
  }
  async validate() {
    return false;
  }
  async publish(): Promise<never> {
    throw new Error('unsupported_capability');
  }
  async getPublicationStatus() {
    return 'UNAVAILABLE';
  }
  async getAnalytics() {
    return { followers: null, reach: null, engagement: null };
  }
}
export const connectors: Record<Channel, SocialConnector> = {
  instagram: new ManualExportConnector('instagram'),
  facebook: new ManualExportConnector('facebook'),
  whatsapp: new ManualExportConnector('whatsapp'),
  tiktok: new ManualExportConnector('tiktok'),
  x: new ManualExportConnector('x'),
  linkedin: new ManualExportConnector('linkedin'),
};
