'use client';
import { useState, useRef, useEffect } from 'react';
import { BookOpen, Plus, ChevronDown, Video } from 'lucide-react';
import type { UniversitySort, UniversityVideo } from './types';
import { extractVideoId, resolveThumbnail } from './types';

const sortOptions: { id: UniversitySort; label: string }[] = [
  { id: 'recent', label: 'Mais recentes' },
  { id: 'oldest', label: 'Mais antigos' },
  { id: 'updated', label: 'Última alteração' },
  { id: 'az', label: 'Nome A-Z' },
  { id: 'za', label: 'Nome Z-A' },
];

export function UniversityList({
  videos,
  currentSort,
  onSortChange,
  onSelectVideo,
  onNewVideo,
  canEdit,
}: {
  videos: UniversityVideo[];
  currentSort: UniversitySort;
  onSortChange: (sort: UniversitySort) => void;
  onSelectVideo: (video: UniversityVideo) => void;
  onNewVideo: () => void;
  canEdit: boolean;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentLabel =
    sortOptions.find((o) => o.id === currentSort)?.label || 'Mais recentes';

  return (
    <div className="university-container">
      {/* Header */}
      <div className="university-header">
        <div className="university-header-info">
          <div className="university-header-icon">
            <BookOpen size={24} />
          </div>
          <div className="university-header-text">
            <h1>Universidade</h1>
            <p>Gerencie os vídeos de treinamento.</p>
          </div>
        </div>

        <div className="university-header-actions">
          {/* Sort Dropdown */}
          <div className="university-sort-dropdown" ref={dropdownRef}>
            <button
              className="university-sort-btn"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
            >
              <span>{currentLabel}</span>
              <ChevronDown size={16} />
            </button>

            {dropdownOpen && (
              <div className="university-sort-menu" role="listbox">
                {sortOptions.map((opt) => (
                  <button
                    key={opt.id}
                    className={`university-sort-item ${currentSort === opt.id ? 'active' : ''}`}
                    onClick={() => {
                      onSortChange(opt.id);
                      setDropdownOpen(false);
                    }}
                    type="button"
                    role="option"
                    aria-selected={currentSort === opt.id}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* New Video Button */}
          {canEdit && (
            <button
              className="university-btn-primary"
              onClick={onNewVideo}
              type="button"
            >
              <Plus size={16} />
              <span>Novo Vídeo</span>
            </button>
          )}
        </div>
      </div>

      {/* Videos List */}
      {videos.length === 0 ? (
        <div className="university-empty">
          <Video size={40} color="#94a3b8" />
          <h3>Nenhum vídeo cadastrado</h3>
          <p>Adicione o primeiro vídeo de treinamento para a equipe.</p>
        </div>
      ) : (
        <div className="university-list">
          {videos.map((video) => {
            const thumb = resolveThumbnail(video);

            return (
              <article
                key={video.id}
                className="university-card"
                onClick={() => onSelectVideo(video)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectVideo(video);
                  }
                }}
              >
                <div className="university-card-thumb">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={video.title}
                      onError={(e) => {
                        if (thumb.includes('maxresdefault.jpg')) {
                          e.currentTarget.src = thumb.replace('maxresdefault.jpg', 'hqdefault.jpg');
                        }
                      }}
                    />
                  ) : (
                    <div className="university-card-thumb-placeholder">
                      <Video size={28} />
                    </div>
                  )}
                </div>

                <div className="university-card-content">
                  <h3 className="university-card-title">{video.title}</h3>
                  <p className="university-card-desc">{video.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
