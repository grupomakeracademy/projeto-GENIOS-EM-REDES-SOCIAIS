export type UniversityVideo = {
  id: string;
  workspace_id: string;
  title: string;
  video_url: string;
  description: string;
  thumbnail_url: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
};

export type UniversitySort = 'recent' | 'oldest' | 'updated' | 'az' | 'za';

export function extractVideoId(url: string): {
  provider: 'youtube' | 'vimeo' | 'unknown';
  id: string;
  embedUrl: string;
  defaultThumbnail: string;
  fallbackThumbnail: string;
} {
  const trimmed = (url || '').trim();
  // YouTube (supports youtu.be, youtube.com/watch?v=, youtube.com/embed/, shorts, etc.)
  const ytMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/,
  );
  if (ytMatch && ytMatch[1]) {
    const id = ytMatch[1];
    return {
      provider: 'youtube',
      id,
      embedUrl: `https://www.youtube.com/embed/${id}`,
      defaultThumbnail: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      fallbackThumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }
  // Vimeo
  const vimeoMatch = trimmed.match(
    /vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|)(\d+)/,
  );
  if (vimeoMatch && vimeoMatch[3]) {
    const id = vimeoMatch[3];
    return {
      provider: 'vimeo',
      id,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      defaultThumbnail: '',
      fallbackThumbnail: '',
    };
  }
  return {
    provider: 'unknown',
    id: '',
    embedUrl: trimmed,
    defaultThumbnail: '',
    fallbackThumbnail: '',
  };
}

/**
 * Resolves the active thumbnail for a video according to user priority:
 * 1. If the user added a custom thumbnail inside the system, the user's thumbnail PREVAILS.
 * 2. If the user did not add a custom thumbnail, the original video thumbnail is used (e.g. YouTube).
 */
export function resolveThumbnail(video: {
  video_url?: string;
  thumbnail_url?: string | null;
}): string {
  // If user provided / uploaded a custom thumbnail, it prevails:
  if (video.thumbnail_url && video.thumbnail_url.trim()) {
    return video.thumbnail_url.trim();
  }
  // Otherwise, use the original video thumbnail if available:
  if (video.video_url) {
    const { defaultThumbnail } = extractVideoId(video.video_url);
    if (defaultThumbnail) return defaultThumbnail;
  }
  return '';
}

/**
 * Checks whether a given thumbnail URL is a user-uploaded / custom thumbnail
 * vs an auto-detected YouTube or Vimeo thumbnail.
 */
export function isCustomThumbnail(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    !lower.includes('img.youtube.com') &&
    !lower.includes('i.ytimg.com') &&
    !lower.includes('vimeocdn.com')
  );
}
