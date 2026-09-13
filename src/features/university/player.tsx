'use client';
import { useState } from 'react';
import { ArrowLeft, Trash2, Edit3 } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import type { UniversityVideo } from './types';
import { extractVideoId, resolveThumbnail } from './types';

export function UniversityPlayer({
  video,
  onBack,
  onEdit,
  onDelete,
  canEdit,
}: {
  video: UniversityVideo;
  onBack: () => void;
  onEdit: () => void;
  onDelete: (id: string) => Promise<void>;
  canEdit: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);

  const { embedUrl, defaultThumbnail } = extractVideoId(video.video_url);
  const posterThumb = resolveThumbnail(video) || defaultThumbnail;
  const isHotmartPrebaked = posterThumb?.includes('thumb-hotmart');

  const playUrl = embedUrl.includes('?')
    ? `${embedUrl}&autoplay=1`
    : `${embedUrl}?autoplay=1&rel=0`;

  // Linkify helper to make URLs clickable in the description
  function renderDescription(text: string) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return part;
    });
  }

  return (
    <div className="university-container university-watch-view">
      {/* Back Link */}
      <button className="university-back-link" onClick={onBack} type="button">
        <ArrowLeft size={16} />
        <span>Voltar para os vídeos</span>
      </button>

      {/* Video Player */}
      <div className="university-player-frame">
        {isPlaying && embedUrl ? (
          <iframe
            src={playUrl}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <div
            className="university-player-poster"
            style={{
              backgroundImage: `url(${posterThumb})`,
            }}
            onClick={() => setIsPlaying(true)}
            role="button"
            tabIndex={0}
            aria-label="Reproduzir vídeo"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsPlaying(true);
              }
            }}
          >
            {!isHotmartPrebaked && (
              <div className="university-player-overlay">
                <button
                  className="university-youtube-play-btn"
                  type="button"
                  aria-label="Reproduzir vídeo"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPlaying(true);
                  }}
                >
                  <svg viewBox="0 0 68 48" width="68" height="48">
                    <path
                      className="ytp-play-bg"
                      d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"
                      fill="#f00"
                    />
                    <path d="M 45,24 27,14 27,34" fill="#fff" />
                  </svg>
                </button>

                {video.video_url && (
                  <a
                    href={video.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="university-watch-on-yt"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Assista no</span>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="#f00">
                      <path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z" />
                    </svg>
                    <strong>YouTube</strong>
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="university-watch-card">
        <h2 className="university-watch-title">{video.title}</h2>
        <div className="university-watch-desc">
          {renderDescription(video.description)}
        </div>

        {canEdit && (
          <div className="university-watch-actions">
            <button
              className="university-btn-danger"
              onClick={() => setConfirmDelete(true)}
              type="button"
            >
              <Trash2 size={16} />
              <span>Deletar</span>
            </button>

            <button
              className="university-btn-primary"
              onClick={onEdit}
              type="button"
            >
              <Edit3 size={16} />
              <span>Editar Vídeo</span>
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <Modal
          title="Excluir vídeo de treinamento?"
          onClose={() => !busy && setConfirmDelete(false)}
        >
          <p>
            Tem certeza de que deseja excluir o vídeo “<strong>{video.title}</strong>”? Esta ação não pode ser desfeita.
          </p>
          <div className="form-row" style={{ marginTop: 20 }}>
            <Button
              secondary
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              Cancelar
            </Button>
            <Button
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(video.id);
                  setConfirmDelete(false);
                  onBack();
                } finally {
                  setBusy(false);
                }
              }}
            >
              Excluir vídeo
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
