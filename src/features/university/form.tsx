'use client';
import { useState, useRef } from 'react';
import { ArrowLeft, Image as ImageIcon, X } from 'lucide-react';
import type { UniversityVideo } from './types';
import { extractVideoId, isCustomThumbnail } from './types';

export function UniversityForm({
  video,
  onBack,
  onSaved,
}: {
  video?: UniversityVideo | null;
  onBack: () => void;
  onSaved: (video: UniversityVideo) => void;
}) {
  const isEditing = Boolean(video?.id);

  const [title, setTitle] = useState(video?.title || '');
  const [videoUrl, setVideoUrl] = useState(video?.video_url || '');
  const [description, setDescription] = useState(video?.description || '');
  
  // Custom thumbnail states
  const hasExistingCustom = isCustomThumbnail(video?.thumbnail_url);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [customFilePreview, setCustomFilePreview] = useState<string | null>(null);
  const [removeCustom, setRemoveCustom] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect original video thumbnail from current URL
  const { defaultThumbnail: originalThumbnail } = extractVideoId(videoUrl);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setThumbnailFile(file);
      setRemoveCustom(false);
      const objUrl = URL.createObjectURL(file);
      setCustomFilePreview(objUrl);
    }
  }

  function handleRemoveCustom(e: React.MouseEvent) {
    e.stopPropagation();
    setThumbnailFile(null);
    setCustomFilePreview(null);
    setRemoveCustom(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !videoUrl.trim() || !description.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const formData = new FormData();
      if (isEditing && video?.id) {
        formData.append('id', video.id);
      }
      formData.append('title', title.trim());
      formData.append('video_url', videoUrl.trim());
      formData.append('description', description.trim());

      // Thumbnail logic:
      // 1. If user uploaded a new file -> upload it (it prevails)
      // 2. If user explicitly removed custom thumbnail -> set thumbnail_url to empty
      // 3. If user had an existing custom thumbnail and didn't remove it -> keep it
      // 4. Otherwise -> set empty so the original video thumbnail is used
      if (thumbnailFile) {
        formData.append('thumbnail', thumbnailFile);
      } else if (removeCustom) {
        formData.append('thumbnail_url', '');
      } else if (hasExistingCustom && video?.thumbnail_url) {
        formData.append('thumbnail_url', video.thumbnail_url);
      } else {
        formData.append('thumbnail_url', '');
      }

      const method = isEditing ? 'PATCH' : 'POST';
      const res = await fetch('/api/university', {
        method,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Erro ao salvar vídeo');
      }

      onSaved(data.item);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao processar requisição');
    } finally {
      setBusy(false);
    }
  }

  // Determine what thumbnail to preview in the dropzone:
  // - If user uploaded a new custom file: customFilePreview (prevails)
  // - If video had a custom thumbnail and wasn't removed: video.thumbnail_url (prevails)
  // - Otherwise: originalThumbnail from video URL (YouTube original)
  const activePreview = customFilePreview
    ? customFilePreview
    : !removeCustom && hasExistingCustom && video?.thumbnail_url
      ? video.thumbnail_url
      : originalThumbnail || null;

  const isCustomActive = Boolean(customFilePreview || (!removeCustom && hasExistingCustom));

  return (
    <div className="university-container university-form-view">
      {/* Back Link */}
      <button className="university-back-link" onClick={onBack} type="button">
        <ArrowLeft size={16} />
        <span>Voltar para os vídeos</span>
      </button>

      {/* Header */}
      <div className="university-form-header">
        <h2>{isEditing ? 'Editar Vídeo' : 'Novo Vídeo'}</h2>
        {!isEditing && (
          <p>Adicione um novo conteúdo de treinamento para a equipe.</p>
        )}
      </div>

      {/* Form Card */}
      <form className="university-form-card" onSubmit={handleSubmit}>
        {error && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: '#fff1f2',
              color: '#e11d48',
              fontSize: '13px',
              marginBottom: '20px',
              border: '1px solid #fecdd3',
            }}
          >
            {error}
          </div>
        )}

        {/* Título */}
        <div className="university-form-group">
          <label htmlFor="video-title">
            Título do Vídeo <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="video-title"
            type="text"
            placeholder={isEditing ? '' : 'Ex: Como abordar um lead...'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        {/* URL */}
        <div className="university-form-group">
          <label htmlFor="video-url">
            URL do Vídeo (YouTube ou Vimeo) <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            id="video-url"
            type="text"
            placeholder={
              isEditing ? '' : 'https://www.youtube.com/watch?v=...'
            }
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            required
          />
          <div className="university-form-help">
            Cole o link completo do vídeo no YouTube ou Vimeo.
          </div>
        </div>

        {/* Descrição */}
        <div className="university-form-group">
          <label htmlFor="video-desc">
            Descrição <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            id="video-desc"
            placeholder={isEditing ? '' : 'Descreva o conteúdo do vídeo...'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            required
          />
        </div>

        {/* Capa / Thumbnail */}
        <div className="university-form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ margin: 0 }}>
              Capa / Thumbnail do Vídeo (Opcional - Formato 16:9 recomendado)
            </label>
            {isCustomActive && (
              <button
                type="button"
                onClick={handleRemoveCustom}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#e11d48',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: 0,
                }}
              >
                <X size={14} />
                <span>Usar capa original do vídeo</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <div
            className="university-dropzone"
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            {activePreview ? (
              <div className="university-dropzone-preview">
                <img
                  src={activePreview}
                  alt="Thumbnail preview"
                  onError={(e) => {
                    if (activePreview.includes('maxresdefault.jpg')) {
                      e.currentTarget.src = activePreview.replace('maxresdefault.jpg', 'hqdefault.jpg');
                    }
                  }}
                />
              </div>
            ) : (
              <div className="university-dropzone-icon">
                <ImageIcon size={32} />
              </div>
            )}

            <div className="university-dropzone-text">
              {isCustomActive
                ? thumbnailFile
                  ? 'Trocar imagem personalizada'
                  : 'Trocar capa personalizada'
                : activePreview
                  ? 'Enviar capa personalizada'
                  : 'Escolher imagem'}
            </div>
            <div className="university-dropzone-sub">
              {thumbnailFile
                ? `${thumbnailFile.name} (capa personalizada prevalecerá)`
                : isCustomActive
                  ? 'Capa personalizada cadastrada (prevalecendo sobre a original)'
                  : activePreview
                    ? 'Usando capa original do vídeo. Clique para escolher uma personalizada.'
                    : 'Apenas imagens (PNG, JPG)'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="university-form-actions">
          <button
            type="button"
            className="university-btn-secondary"
            onClick={onBack}
            disabled={busy}
          >
            Cancelar
          </button>

          <button
            type="submit"
            className="university-btn-primary"
            disabled={busy}
          >
            {busy ? 'Salvando...' : 'Salvar Vídeo'}
          </button>
        </div>
      </form>
    </div>
  );
}
