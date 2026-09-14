import type { Metadata } from 'next';
import './site.css';
export const metadata: Metadata = {
  title: 'Gênio em Redes Sociais — Conteúdo com a inteligência da sua marca',
  description:
    'Uma inteligência especializada no seu negócio. Conecte estratégia, identidade e memória à criação de conteúdo. Conheça o Gênio em Redes Sociais.',
  openGraph: {
    title: 'Sua marca tem uma história. Dê inteligência a ela.',
    description: 'Estratégia, identidade e memória. Juntas, em um Gênio feito para sua empresa.',
    locale: 'pt_BR',
    type: 'website',
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
