'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { UniversitySort, UniversityVideo } from './types';
import { UniversityList } from './list';
import { UniversityPlayer } from './player';
import { UniversityForm } from './form';
import './university.css';

export function UniversityView({
  initialVideos,
  canEdit,
}: {
  initialVideos: UniversityVideo[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [videos, setVideos] = useState<UniversityVideo[]>(initialVideos);
  const [sort, setSort] = useState<UniversitySort>('recent');

  const paramVideo = searchParams.get('video');
  const paramNew = searchParams.get('new') === '1';
  const paramEdit = searchParams.get('edit');

  const [mode, setMode] = useState<'list' | 'watch' | 'new' | 'edit'>(
    canEdit && paramNew ? 'new' : canEdit && paramEdit ? 'edit' : paramVideo ? 'watch' : 'list',
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    paramVideo || paramEdit || (initialVideos[0]?.id ?? null),
  );

  // Scroll to top whenever screen mode changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [mode]);

  const selectedVideo =
    videos.find((v) => v.id === selectedId) || videos[0] || null;

  function goToList() {
    setMode('list');
    router.replace('/university');
  }

  function goToNew() {
    if (!canEdit) return;
    setMode('new');
    router.replace('/university?new=1');
  }

  function goToWatch(video: UniversityVideo) {
    setSelectedId(video.id);
    setMode('watch');
    router.replace(`/university?video=${video.id}`);
  }

  function goToEdit(video: UniversityVideo) {
    if (!canEdit) return;
    setSelectedId(video.id);
    setMode('edit');
    router.replace(`/university?edit=${video.id}`);
  }

  function handleSortChange(newSort: UniversitySort) {
    setSort(newSort);
    const sorted = [...videos];
    if (newSort === 'recent') {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (newSort === 'oldest') {
      sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (newSort === 'updated') {
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } else if (newSort === 'az') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (newSort === 'za') {
      sorted.sort((a, b) => b.title.localeCompare(a.title));
    }
    setVideos(sorted);
  }

  async function handleDelete(id: string) {
    if (!canEdit) return;
    const res = await fetch('/api/university', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error('Falha ao excluir vídeo');

    setVideos((prev) => prev.filter((v) => v.id !== id));
    goToList();
  }

  function handleSaved(savedVideo: UniversityVideo) {
    setVideos((prev) => {
      const idx = prev.findIndex((v) => v.id === savedVideo.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedVideo;
        return next;
      }
      return [savedVideo, ...prev];
    });
    goToWatch(savedVideo);
  }

  if (canEdit && mode === 'new') {
    return (
      <UniversityForm
        onBack={goToList}
        onSaved={handleSaved}
      />
    );
  }

  if (canEdit && mode === 'edit' && selectedVideo) {
    return (
      <UniversityForm
        video={selectedVideo}
        onBack={() => goToWatch(selectedVideo)}
        onSaved={handleSaved}
      />
    );
  }

  if (mode === 'watch' && selectedVideo) {
    return (
      <UniversityPlayer
        video={selectedVideo}
        canEdit={canEdit}
        onBack={goToList}
        onEdit={() => goToEdit(selectedVideo)}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <UniversityList
      videos={videos}
      currentSort={sort}
      onSortChange={handleSortChange}
      onSelectVideo={goToWatch}
      onNewVideo={goToNew}
      canEdit={canEdit}
    />
  );
}
