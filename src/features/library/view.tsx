'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { File, Upload, HardDrive, Shield } from 'lucide-react';
import { Card, Button, Field, Empty, Modal, Notice, useT, useAction, api } from '@/components/ui';
import type { Asset } from '@/lib/domain';
import { AssetAgents, type AssetAgent } from './agent-assets';

export type UserQuotaItem = {
  id: string;
  name: string;
  usedBytes: number;
  quotaMB: number;
  isUnlimited: boolean;
  role: string;
};

export function Library({
  items,
  canEdit,
  canAdmin = false,
  total,
  page,
  agents,
  userUsedBytes = 0,
  userQuotaMB = 100,
}: {
  items: Asset[];
  canEdit: boolean;
  canAdmin?: boolean;
  total: number;
  page: number;
  agents: AssetAgent[];
  userUsedBytes?: number;
  userQuotaMB?: number;
}) {
  const t = useT(),
    action = useAction(),
    router = useRouter(),
    [edit, setEdit] = useState<Asset | null>(null),
    [remove, setRemove] = useState<Asset | null>(null),
    [selectedFilesCount, setSelectedFilesCount] = useState(0),
    [selectedBatchBytes, setSelectedBatchBytes] = useState(0),
    [batchError, setBatchError] = useState(''),
    [adminModalOpen, setAdminModalOpen] = useState(false),
    [adminUsers, setAdminUsers] = useState<UserQuotaItem[]>([]),
    [loadingAdminUsers, setLoadingAdminUsers] = useState(false),
    [savingUserId, setSavingUserId] = useState<string | null>(null),
    [quotaEditValues, setQuotaEditValues] = useState<
      Record<string, { value: number; unlimited: boolean }>
    >({});

  const isUnlimited = userQuotaMB === -1 || userQuotaMB === null;
  const usedMB = (userUsedBytes / (1024 * 1024)).toFixed(1);
  const percentage = isUnlimited
    ? 0
    : Math.min(100, Math.round((userUsedBytes / (userQuotaMB * 1024 * 1024)) * 100));

  async function openAdminModal() {
    setAdminModalOpen(true);
    setLoadingAdminUsers(true);
    try {
      const res = await api('assets/quota');
      if (res?.users) {
        setAdminUsers(res.users);
        const initialMap: Record<string, { value: number; unlimited: boolean }> = {};
        for (const u of res.users) {
          initialMap[u.id] = {
            value: u.quotaMB === -1 ? 100 : u.quotaMB,
            unlimited: u.isUnlimited,
          };
        }
        setQuotaEditValues(initialMap);
      }
    } catch {
      // fallback
    } finally {
      setLoadingAdminUsers(false);
    }
  }

  async function handleSaveQuota(userId: string) {
    const config = quotaEditValues[userId];
    if (!config) return;
    setSavingUserId(userId);
    try {
      const targetQuota = config.unlimited ? -1 : Number(config.value);
      await api('assets/quota', 'POST', { userId, quotaMB: targetQuota });
      setAdminUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, quotaMB: targetQuota, isUnlimited: targetQuota === -1 } : u,
        ),
      );
      router.refresh();
    } catch {
      // handle error
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <>
      <div className="page-heading">
        <h1>{t('library')}</h1>
        <p>{t('libraryIntro')}</p>
      </div>

      {/* Storage quota card */}
      <Card style={{ marginBottom: 18 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <HardDrive size={20} />
            </div>
            <div>
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>
                Armazenamento da Biblioteca
              </strong>
              <div style={{ fontSize: '13px', color: '#64748b', marginTop: 2 }}>
                {isUnlimited ? (
                  <span>
                    {usedMB} MB utilizados ·{' '}
                    <strong style={{ color: '#10b981' }}>Armazenamento Ilimitado</strong>
                  </span>
                ) : (
                  <span>
                    <strong>{usedMB} MB</strong> de <strong>{userQuotaMB} MB</strong> utilizados (
                    {percentage}%)
                  </span>
                )}
              </div>
            </div>
          </div>
          {canAdmin && (
            <Button secondary type="button" onClick={openAdminModal}>
              <Shield size={16} />
              Gerenciar espaço dos usuários
            </Button>
          )}
        </div>
        {!isUnlimited && (
          <div
            style={{
              width: '100%',
              height: 8,
              background: '#e2e8f0',
              borderRadius: 4,
              overflow: 'hidden',
              marginTop: 14,
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(percentage, 2)}%`,
                background: percentage > 90 ? '#ef4444' : percentage > 75 ? '#f59e0b' : '#3b82f6',
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}
      </Card>

      {canEdit ? (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedBatchBytes > 50 * 1024 * 1024) return;
              const form = e.currentTarget;
              const data = new FormData(form);
              void action.act(async () => {
                await api('assets', 'POST', data);
                form.reset();
                setSelectedFilesCount(0);
                setSelectedBatchBytes(0);
                setBatchError('');
                router.refresh();
              });
            }}
          >
            <div className="form-row" style={{ alignItems: 'flex-start' }}>
              <Field label={t('upload')}>
                <input
                  type="file"
                  name="files"
                  multiple
                  required
                  accept="image/png,image/jpeg,image/webp,application/pdf,text/plain"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
                    setSelectedFilesCount(files.length);
                    setSelectedBatchBytes(totalBytes);
                    if (totalBytes > 50 * 1024 * 1024) {
                      setBatchError(
                        'O tamanho total dos arquivos excede o limite de 50 megas por envio.',
                      );
                    } else {
                      setBatchError('');
                    }
                  }}
                />
                <div style={{ marginTop: 6, fontSize: '12px' }}>
                  {selectedFilesCount > 0 ? (
                    <span
                      style={{
                        color: selectedBatchBytes > 50 * 1024 * 1024 ? '#dc2626' : '#2563eb',
                        fontWeight: 600,
                      }}
                    >
                      {selectedFilesCount} arquivo(s) selecionado(s) —{' '}
                      {(selectedBatchBytes / (1024 * 1024)).toFixed(2)} MB / 50 MB máx.
                    </span>
                  ) : (
                    <small className="muted">
                      Envio em massa permitido (máximo de 50 megas por envio).
                    </small>
                  )}
                </div>
                {batchError && (
                  <p style={{ color: '#dc2626', fontSize: '12px', marginTop: 4 }}>{batchError}</p>
                )}
              </Field>
              <Field label={t('category')}>
                <input name="category" required defaultValue="reference" maxLength={80} />
              </Field>
              <div style={{ paddingTop: 24 }}>
                <Button
                  busy={action.busy}
                  type="submit"
                  disabled={Boolean(batchError) || selectedBatchBytes > 50 * 1024 * 1024}
                >
                  <Upload size={17} />
                  {selectedFilesCount > 1
                    ? `Enviar ${selectedFilesCount} arquivos`
                    : t('upload')}
                </Button>
              </div>
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
              <AssetAgents assetId={asset.id} agents={agents} canEdit={canEdit} />
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

      {/* Edit modal */}
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

      {/* Remove modal */}
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

      {/* Super Admin Manage Quotas Modal */}
      {adminModalOpen && (
        <Modal
          title="Gestão de Espaço dos Usuários (Super Admin)"
          subtitle="Defina o limite de armazenamento em megas por usuário ou marque como ilimitado."
          onClose={() => setAdminModalOpen(false)}
        >
          {loadingAdminUsers ? (
            <p className="muted" style={{ padding: 20, textAlign: 'center' }}>
              Carregando usuários...
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                maxHeight: '60vh',
                overflowY: 'auto',
              }}
            >
              {adminUsers.map((u) => {
                const conf = quotaEditValues[u.id] || {
                  value: u.quotaMB === -1 ? 100 : u.quotaMB,
                  unlimited: u.isUnlimited,
                };
                const uMB = (u.usedBytes / (1024 * 1024)).toFixed(1);
                return (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      background: '#f8fafc',
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>{u.name}</strong>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        Papel: {u.role} · Em uso: <strong>{uMB} MB</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <label className="check" style={{ fontSize: '13px', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={conf.unlimited}
                          onChange={(e) => {
                            setQuotaEditValues({
                              ...quotaEditValues,
                              [u.id]: { ...conf, unlimited: e.target.checked },
                            });
                          }}
                        />
                        Ilimitado
                      </label>
                      {!conf.unlimited && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min={1}
                            max={100000}
                            style={{
                              width: 85,
                              padding: '6px 8px',
                              borderRadius: 6,
                              border: '1px solid #cbd5e1',
                              fontSize: '13px',
                            }}
                            value={conf.value}
                            onChange={(e) => {
                              setQuotaEditValues({
                                ...quotaEditValues,
                                [u.id]: { ...conf, value: Math.max(1, Number(e.target.value)) },
                              });
                            }}
                          />
                          <span style={{ fontSize: '12px', color: '#64748b' }}>MB</span>
                        </div>
                      )}
                      <Button
                        secondary
                        disabled={savingUserId === u.id}
                        onClick={() => handleSaveQuota(u.id)}
                      >
                        {savingUserId === u.id ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
