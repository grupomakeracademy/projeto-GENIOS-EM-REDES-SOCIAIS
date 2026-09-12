import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Language } from '@/components/ui';
import { branding, type Locale } from '@/lib/i18n';
import './globals.css';
export const metadata: Metadata = {
  title: branding.name,
  description: 'Operação de conteúdo com identidade de marca, agentes de IA e memória editorial.',
  icons: { icon: '/favicon.svg' },
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = (await cookies()).get('locale')?.value;
  const locale: Locale = raw === 'en-US' || raw === 'es-ES' ? raw : 'pt-BR';
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('genios-theme')||'light';var e=t;if(t==='system'){e=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',e);document.documentElement.style.colorScheme=e;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <Language locale={locale}>{children}</Language>
      </body>
    </html>
  );
}
