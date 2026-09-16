'use client';
import { useState } from 'react';
import { Upload, Download, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import type { Channel } from '@/lib/domain';
import type { ImportPreviewImage } from './images';
import styles from './view.module.css';
import controls from './preview.module.css';

export type ImportPreviewRecord = {
  id: string;
  url: string;
  width: number;
  height: number;
  images?: ImportPreviewImage[];
};

export function ImportPreview({
  item,
  title,
  caption,
  channel,
}: {
  item: ImportPreviewRecord | null;
  title: string;
  caption: string;
  channel?: Channel | '' | null;
}) {
  const [position, setPosition] = useState(0);
  const images = item ? (item.images?.length ? item.images : [item]) : [];
  const current = images[position] || images[0];
  return (
    <Card className={styles.preview}>
      <h2>Preview da postagem</h2>
      <div className="preview-frame phone">
        <header>
          {channel ? <SocialLogo channel={channel} /> : null}
          <strong>{title}</strong>
        </header>
        {current ? (
          <img
            src={current.url}
            alt="Imagem original importada"
            width={current.width}
            height={current.height}
            style={{ width: '100%', height: 'auto', objectFit: 'contain' }}
          />
        ) : (
          <div className={styles.placeholder}>
            <Upload />
            <p>Envie uma imagem para visualizar</p>
          </div>
        )}
        <p className={styles.caption}>{caption || 'Sua legenda aparecerá aqui.'}</p>
      </div>
      {images.length > 1 ? (
        <div className={controls.slides}>
          <span className={controls.label}>Slides do Carrossel</span>
          <nav className={controls.pages} aria-label="Slides do Carrossel">
            {images.map((_, index) => (
              <button
                type="button"
                key={index}
                className={`${controls.pill} ${index === position ? controls.active : ''}`}
                aria-label={`Slide ${index + 1}`}
                aria-current={index === position ? 'step' : undefined}
                aria-pressed={index === position}
                onClick={() => setPosition(index)}
              >
                {index + 1}
              </button>
            ))}
          </nav>
        </div>
      ) : null}
      {item && current ? (
        <div className={controls.actions}>
          <a className={controls.open} href={current.url} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
            <span>Abrir</span>
          </a>
          <a
            className={controls.download}
            href={`/api/imports/${item.id}?download=1${images.length > 1 ? `&slide=${position}` : ''}`}
            download
          >
            <Download size={18} />
            <span>Baixar</span>
          </a>
        </div>
      ) : null}
    </Card>
  );
}
