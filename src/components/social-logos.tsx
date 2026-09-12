import React from 'react';
import type { Channel } from '@/lib/domain';

export function InstagramLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="ig-grad" cx="20%" cy="110%" r="130%">
          <stop offset="0%" stopColor="#ffdc80" />
          <stop offset="25%" stopColor="#fd5949" />
          <stop offset="50%" stopColor="#d6249f" />
          <stop offset="100%" stopColor="#285aeb" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#ig-grad)" />
      <rect x="5.5" y="5.5" width="13" height="13" rx="3.5" stroke="#ffffff" strokeWidth="1.75" fill="none" />
      <circle cx="12" cy="12" r="3.2" stroke="#ffffff" strokeWidth="1.75" fill="none" />
      <circle cx="15.8" cy="8.2" r="0.9" fill="#ffffff" />
    </svg>
  );
}

export function FacebookLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        d="M13.4 20v-7.2h2.4l.4-2.8h-2.8V8.2c0-.8.2-1.4 1.4-1.4h1.5V4.3c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8v2.8h2.4V20h3z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function WhatsAppLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path
        d="M17.5 14.8c-.3-.1-1.7-.8-1.9-.9-.2-.1-.4-.1-.6.1-.2.3-.6.9-.8 1.1-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.3 0-.5-.1-.1-.6-1.5-.8-2.1-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.2.2 2 3.1 4.9 4.3.7.3 1.2.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.1-1.4-.1-.1-.3-.2-.6-.3z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function TikTokLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="6" fill="#000000" />
      <path
        d="M16.5 8.2c-.9-.4-1.6-1.2-1.9-2.2H12.8v9.3c0 1.5-1.2 2.7-2.7 2.7-1.5 0-2.7-1.2-2.7-2.7 0-1.5 1.2-2.7 2.7-2.7.3 0 .6.1.9.2v-2c-.3 0-.6-.1-.9-.1-2.6 0-4.7 2.1-4.7 4.7s2.1 4.7 4.7 4.7c2.6 0 4.7-2.1 4.7-4.7V10.1c1.1.8 2.5 1.2 3.9 1.2V9.3c-.6 0-1.3-.4-1.6-1.1z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function XLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="6" fill="#000000" />
      <path
        d="M17.1 5.5h-2.1l-4.5 5.9-4.2-5.9H4.1l5.4 7.6-5.4 7.4h2.1l4.8-6.4 4.5 6.4h2.2l-5.7-8.1 5.1-6.9zm-1.8 13.6L7.4 6.8h1.2l7.9 12.3h-1.2z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function LinkedInLogo({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="6" fill="#0A66C2" />
      <path
        d="M6.8 9.3h2.4v7.7H6.8V9.3zM8 5.8c.8 0 1.4.6 1.4 1.4s-.6 1.4-1.4 1.4-1.4-.6-1.4-1.4.6-1.4 1.4-1.4zm3.8 3.5h2.3v1.1h0c.3-.6 1.1-1.3 2.3-1.3 2.5 0 2.9 1.6 2.9 3.8v4.1h-2.4v-3.6c0-.9 0-2-.1.2-1.2 0-1.4.9-1.4 1.9v3.5h-2.4V9.3z"
        fill="#ffffff"
      />
    </svg>
  );
}

export function SocialLogo({
  channel,
  size = 20,
  className = '',
}: {
  channel: Channel | string;
  size?: number;
  className?: string;
}) {
  switch (channel.toLowerCase()) {
    case 'instagram':
      return <InstagramLogo size={size} className={className} />;
    case 'facebook':
      return <FacebookLogo size={size} className={className} />;
    case 'whatsapp':
      return <WhatsAppLogo size={size} className={className} />;
    case 'tiktok':
      return <TikTokLogo size={size} className={className} />;
    case 'x':
    case 'twitter':
      return <XLogo size={size} className={className} />;
    case 'linkedin':
      return <LinkedInLogo size={size} className={className} />;
    default:
      return null;
  }
}
