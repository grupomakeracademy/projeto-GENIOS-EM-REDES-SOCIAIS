import { dashboardCounts } from '@/features/dashboard/metrics';
import { videoFixture } from './fixtures/mp4';
import { describe, it, expect } from 'vitest';
import { statusDate, isUpcoming, inPeriod, monthSummary, type DatedContent } from '@/features/calendar/dates';
import { parseNetworks, applicableNetworks } from '@/lib/network-filter';
import { mp4Dimensions, MAX_IMPORT_VIDEO_BYTES } from '@/features/imports/video';
import { importImages } from '@/features/imports/images';
import { connectionCapabilities } from '@/lib/social/connection-capabilities';
const item:DatedContent = {id:'one',topic:'Example',status:'PUBLISHED',created_at:'2026-08-01T12:00:00Z',scheduled_at:'2026-09-05T12:00:00Z',
 content_events:[{event:'APPROVED',created_at:'2026-08-20T12:00:00Z'},{event:'AWAITING_REVIEW',created_at:'2026-08-19T12:00:00Z'}],
 content_variants:[{channel:'instagram',published_at:'2026-09-06T03:00:00Z'}]};
describe('network selection and lifecycle dates',()=>{
 it('normalizes multi-selection, All and applicable networks',()=>{
  expect(parseNetworks('instagram,facebook,instagram,unknown')).toEqual(['instagram','facebook']);
  expect(parseNetworks('')).toEqual([]);
  expect(applicableNetworks(['instagram','facebook'])).toEqual(['instagram','facebook']);
 });
 it('uses real publication, scheduled and transition dates without editing history',()=>{
  const original=JSON.stringify(item);
  expect(statusDate(item)).toBe('2026-09-06T03:00:00Z');
  expect(statusDate({...item,status:'SCHEDULED'})).toBe(item.scheduled_at);
  expect(statusDate({...item,status:'APPROVED'})).toBe('2026-08-20T12:00:00Z');
  expect(statusDate({...item,status:'AWAITING_REVIEW'})).toBe('2026-08-19T12:00:00Z');
  expect(JSON.stringify(item)).toBe(original);
 });
 it('falls back to publication receipts/events, never creation for published',()=>{
  expect(statusDate({...item,content_variants:[],content_events:[]})).toBeNull();
  expect(statusDate({...item,content_variants:[{channel:'facebook',content_publications:[{published_at:'2026-09-07T12:00:00Z'}]}]})).toBe('2026-09-07T12:00:00Z');
 });
 it('excludes published from upcoming and evaluates month with timezone boundaries',()=>{
  expect(isUpcoming(item)).toBe(false);
  expect(isUpcoming({...item,status:'APPROVED'})).toBe(true);
  expect(inPeriod(statusDate(item),'2026-09-01T00:00:00-03:00','2026-10-01T00:00:00-03:00')).toBe(true);
  expect(inPeriod('2026-09-01T01:00:00Z','2026-09-01T00:00:00-03:00','2026-10-01T00:00:00-03:00')).toBe(false);
 });
});
describe('MP4 validation and connector capabilities',()=>{
 it('preserves original dimensions, rotation and original bytes',()=>{
  const b=videoFixture(),copy=Buffer.from(b);
  expect(mp4Dimensions(b)).toEqual({width:1080,height:1920});expect(b).toEqual(copy);
  expect(mp4Dimensions(videoFixture(1920,1080,true))).toEqual({width:1080,height:1920});
  expect(mp4Dimensions(videoFixture(1024,768))).toEqual({width:1024,height:768});
 });
 it('rejects invalid MP4 structure and mixed or multiple video media',()=>{
  expect(()=>mp4Dimensions(Buffer.from('not a video'))).toThrow();
  const video={storage_path:'original.mp4',mime_type:'video/mp4',width:1080,height:1920};
  expect(()=>importImages({...video,images:[video,video]})).toThrow();
  expect(importImages(video)).toEqual([video]);expect(MAX_IMPORT_VIDEO_BYTES).toBe(524288000);
 });
 it('uses connector and account capabilities, hiding unsupported video destinations',()=>{
  expect(connectionCapabilities('instagram',{connected_via:'meta_oauth_official',account_type:'BUSINESS'}).videoDestinations).toEqual(['feed','stories','feed_and_stories']);
  expect(connectionCapabilities('instagram',{account_type:'MEDIA_CREATOR'}).videoDestinations).toEqual(['feed']);
  expect(connectionCapabilities('facebook').videoDestinations).toEqual([]);
  expect(connectionCapabilities('instagram',{connected_via:'demo_oauth'}).canPublish).toBe(false);
 });
});

it('recalculates dashboard and all month counters from matching dates and states',()=>{
 const rows=[item,{...item,id:'draft',status:'DRAFT',created_at:'2026-09-02T12:00:00Z'}, {...item,id:'reject',status:'REJECTED',content_events:[{event:'REJECTED',created_at:'2026-09-03T12:00:00Z'}]}, {...item,id:'schedule',status:'SCHEDULED'}];
 expect(dashboardCounts(rows,'2026-09-01T00:00:00Z','2026-10-01T00:00:00Z')).toEqual([1,1,1,0]);
 expect(monthSummary(rows,'2026-09-01T00:00:00Z','2026-10-01T00:00:00Z')).toEqual({published:1,scheduled:1,approved:0,review:0,draft:1,rejected:1});
});
