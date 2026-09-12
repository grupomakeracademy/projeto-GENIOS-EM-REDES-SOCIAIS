'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { File, Upload } from 'lucide-react';
import { Card, Button, Field, Empty, Modal, Notice, useT, useAction, api } from '@/components/ui';
import type { Asset } from '@/lib/domain';
export function Library({
  items,
  canEdit,
  total,
  page,
}: {
  items: Asset[];
  canEdit: boolean;
  total: number;
  page: number;
}) {
  const t = useT(),
    action = useAction(),
    router = useRouter(),
    [edit, setEdit] = useState<Asset | null>(null),
    [remove, setRemove] = useState<Asset | null>(null);
  return (
    <>
      <div className="page-heading">
        <h1>{t('library')}</h1>
        <p>{t('libraryIntro')}</p>
      </div>
      {canEdit ? (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              void action.act(async () => {
                await api('assets', 'POST', data);
                form.reset();
                router.refresh();
              });
            }}
          >
            <div className="form-row">
              <Field label={t('upload')}>
                <input
                  type="file"
                  name="file"
                  required
                  accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
                />
                <small>{t('uploadHint')}</small>
              </Field>
              <Field label={t('category')}>
                <input name="category" required defaultValue="reference" maxLength={80} />
              </Field>
              <Button busy={action.busy} type="submit">
                <Upload size={17} />
                {t('upload')}
              </Button>
            </div>
          </form>
          <Notice {...action} />
        </Card>
      ) : null}
      <div style={{ height: 20 }} />
      {items.length ? (
        <div className="content-grid">
          {items.map((asset) => (
            <Card key={asset.id}>
              {asset.mime_type.startsWith('image/') && asset.url ? (
                <img className="asset-image" src={asset.url} loading="lazy" alt={asset.name} />
              ) : (
                <div className="empty">
                  <File size={38} />
                </div>
              )}
              <h3 style={{ marginTop: 16, overflowWrap: 'anywhere' }}>{asset.name}</h3>
              <small>
                {asset.category} · {Math.ceil(asset.size / 1024)} KB
              </small>
              <div className="form-row" style={{ marginTop: 15 }}>
                <a className="button secondary" href={`/api/download?id=${asset.id}`}>
                  {t('download')}
                </a>
                {canEdit ? (
                  <>
                    <Button secondary onClick={() => setEdit(asset)}>
                      {t('edit')}
                    </Button>
                    <Button secondary onClick={() => setRemove(asset)}>
                      {t('delete')}
                    </Button>
                  </>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty title={t('emptyLibrary')} />
        </Card>
      )}
      {total > 24 ? (
        <div className="pagination">
          <Button
            secondary
            disabled={page <= 1}
            onClick={() => router.push(`/library?page=${page - 1}`)}
          >
            {t('previous')}
          </Button>
          <span>{page}</span>
          <Button
            secondary
            disabled={page * 24 >= total}
            onClick={() => router.push(`/library?page=${page + 1}`)}
          >
            {t('following')}
          </Button>
        </div>
      ) : null}
      {edit ? (
        <Modal title={t('edit')} onClose={() => setEdit(null)}>
          <Field label={t('name')}>
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </Field>
          <Field label={t('category')}>
            <input
              value={edit.category}
              onChange={(e) => setEdit({ ...edit, category: e.target.value })}
            />
          </Field>
          <Button
            busy={action.busy}
            onClick={() =>
              action.act(async () => {
                await api('assets', 'PATCH', {
                  id: edit.id,
                  name: edit.name,
                  category: edit.category,
                });
                setEdit(null);
                router.refresh();
              })
            }
          >
            {t('save')}
          </Button>
        </Modal>
      ) : null}
      {remove ? (
        <Modal title={t('delete')} onClose={() => setRemove(null)}>
          <p>{t('deleteConfirm')}</p>
          <Button
            busy={action.busy}
            onClick={() =>
              action.act(async () => {
                await api('assets', 'DELETE', { id: remove.id });
                setRemove(null);
                router.refresh();
              })
            }
          >
            {t('delete')}
          </Button>
        </Modal>
      ) : null}
    </>
  );
}
