import { context } from '@/lib/security/context';
import { adminClient } from '@/lib/supabase/server';
import { UniversityView } from '@/features/university/view';
import type { UniversityVideo } from '@/features/university/types';
import { isSuperAdmin } from '@/lib/security/super-admin';

export const dynamic = 'force-dynamic';

const defaultModelVideo: UniversityVideo = {
  id: '6a8021d2-c3ef-4ed0-9ce8-2cf7e89bf73b',
  workspace_id: 'default',
  title: 'LINKS DE INDICAÇÃO - 01 - COMO ENTRAR NO PROGRAMA EMBAIXADORAS - Já tenho conta na Hotmart',
  video_url: 'https://youtu.be/UdysAIpSKZI',
  description:
    'O vídeo apresenta o funcionamento e as orientações para adesão ao Programa de Embaixadoras do Geninhos por pessoas que já possuem conta cadastrada na Hotmart. Ele explica como navegar pela página do programa, destacando o processo de indicação da solução educacional para outras famílias e a geração de comissões por cada nova assinatura realizada através do link individual de afiliado.\n\nAlém de detalhar o passo a passo de cadastro e navegação na plataforma, o conteúdo reforça os benefícios de ser uma embaixadora, o uso dos materiais de apoio disponibilizados e a facilidade do controle de vendas e pagamentos intermediados diretamente pela Hotmart.\n\nClique aqui para se afiliar ao Geninhos - https://affiliate.hotmart.com/affiliate-recruiting/view/7435G102933912',
  thumbnail_url: '/university/thumb-hotmart-large.png',
  created_at: '2026-09-13T00:00:00Z',
  updated_at: '2026-09-13T00:00:00Z',
};

export default async function Page() {
  let canEdit = false;
  let videos: UniversityVideo[] = [];

  try {
    const ctx = await context();
    canEdit = isSuperAdmin(ctx.user);

    // Retrieve videos using admin client so that RLS does not block reading shared training materials
    const db = adminClient();
    const { data, error } = await db
      .from('university_videos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      videos = data as UniversityVideo[];
    } else {
      // If table is empty, seed the 1 model video
      const seedItem = {
        ...defaultModelVideo,
        workspace_id: ctx.workspaceId,
        created_by: ctx.user?.id || null,
      };
      if (canEdit && !error) await db.from('university_videos').upsert([seedItem]);
      videos = [seedItem];
    }
  } catch (err) {
    canEdit = false;
    console.error('Safe fallback in university page:', err);
    videos = [defaultModelVideo];
  }

  return (
    <UniversityView
      initialVideos={videos.length > 0 ? videos : [defaultModelVideo]}
      canEdit={canEdit}
    />
  );
}
