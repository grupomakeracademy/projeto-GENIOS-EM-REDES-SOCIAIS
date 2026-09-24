'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { pageBlock } from './pagination';
import { File, Upload, HardDrive, Shield, Lock, X } from 'lucide-react';
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
  isSuperAdmin = false,
  total,
  page,
  agents,
  userUsedBytes = 0,
  userQuotaMB = 100,
}: {
  items: Asset[];
  canEdit: boolean;
  canAdmin?: boolean;
  isSuperAdmin?: boolean;
  total: number;
  page: number;
  agents: AssetAgent[];
  userUsedBytes?: number;
  userQuotaMB?: number;
}) {
  const t = useT(),
    action = useAction(),
    router = useRouter(),
    searchParams = useSearchParams(),
    [edit, setEdit] = useState<Asset | null>(null),
    [remove, setRemove] = useState<Asset | null>(null),
    [selectedFilesCount, setSelectedFilesCount] = useState(0),
    [selectedBatchBytes, setSelectedBatchBytes] = useState(0),
    [batchError, setBatchError] = useState(''),
    [requestModalOpen, setRequestModalOpen] = useState(false),
    [adminModalOpen, setAdminModalOpen] = useState(false),
    [adminUsers, setAdminUsers] = useState<UserQuotaItem[]>([]),
    [loadingAdminUsers, setLoadingAdminUsers] = useState(false),
    [savingUserId, setSavingUserId] = useState<string | null>(null),
    [viewDnaAsset, setViewDnaAsset] = useState<Asset | null>(null),
    [reprocessingId, setReprocessingId] = useState<string | null>(null),
    [uploadCategory, setUploadCategory] = useState<
      'reference' | 'protected_identity' | 'exact_asset'
    >('reference'),
    [settingMasterId, setSettingMasterId] = useState<string | null>(null),
    [quotaEditValues, setQuotaEditValues] = useState<
      Record<string, { value: number; unlimited: boolean }>
    >({});

  async function handleReprocess(assetId: string) {
    setReprocessingId(assetId);
    try {
      await api('assets', 'PATCH', { action: 'reprocess', id: assetId });
      router.refresh();
    } catch (err) {
      console.error('Falha ao reprocessar ativo:', err);
    } finally {
      setReprocessingId(null);
    }
  }

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
          {isSuperAdmin ? (
            <Button secondary type="button" onClick={() => router.push('/settings?tab=library')}>
              <Shield size={16} />
              Gerenciar espaço dos usuários
            </Button>
          ) : (
            <Button secondary type="button" onClick={() => setRequestModalOpen(true)}>
              <Shield size={16} />
              Solicite mais armazenamento
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
              <Field label="Categoria do Ativo">
                <select
                  name="category"
                  value={uploadCategory}
                  onChange={(e) =>
                    setUploadCategory(
                      e.target.value as 'reference' | 'protected_identity' | 'exact_asset',
                    )
                  }
                >
                  <option value="reference">DNA Visual Geral</option>
                  <option value="protected_identity">Identidade Protegida</option>
                  <option value="exact_asset">Asset Exato</option>
                </select>
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

            {uploadCategory === 'protected_identity' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  marginTop: 12,
                  padding: 14,
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                }}
              >
                <Field label="Nome da Identidade">
                  <input
                    name="identity_name"
                    placeholder="Ex: Nome da pessoa, personagem, produto ou elemento visual recorrente..."
                    required
                    maxLength={120}
                  />
                </Field>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
                  <label className="check" style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>
                    <input type="checkbox" name="is_master" value="true" defaultChecked />
                    ⭐ Definir como Referência Mestre
                  </label>
                  <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 24 }}>
                    Apenas uma imagem por identidade pode ser mestre e ela será usada como base quando essa identidade for necessária em uma cena.
                  </span>
                </div>
              </div>
            )}

            {uploadCategory === 'exact_asset' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 12,
                  marginTop: 12,
                  padding: 14,
                  background: '#f5f3ff',
                  borderRadius: 8,
                  border: '1px solid #ddd6fe',
                }}
              >
                <Field label="Tipo do Asset Exato">
                  <select name="asset_subtype" defaultValue="logo">
                    <option value="logo">Logotipo</option>
                    <option value="badge">Selo / Emblema</option>
                    <option value="watermark">Marca d'Água</option>
                    <option value="other">Outro</option>
                  </select>
                </Field>
                <Field label="Posicionamento Automático">
                  <select name="placement" defaultValue="top_left">
                    <option value="top_left">Canto Superior Esquerdo (Padrão)</option>
                    <option value="top_right">Canto Superior Direito</option>
                    <option value="bottom_left">Canto Inferior Esquerdo</option>
                    <option value="bottom_right">Canto Inferior Direito</option>
                    <option value="manual">Sem aplicação automática (Manual)</option>
                  </select>
                </Field>
                <Field label="Tamanho (% da largura da imagem)">
                  <input
                    type="number"
                    name="scale_percent"
                    min={5}
                    max={100}
                    step={1}
                    defaultValue={22}
                    placeholder="22"
                  />
                  <small style={{ color: '#64748b' }}>
                    Padrão recomendado: 20% a 22%. Fidelidade original preservada.
                  </small>
                </Field>
                <div style={{ gridColumn: '1 / -1', fontSize: '12px', color: '#6b21a8' }}>
                  ℹ️ <strong>Asset Exato:</strong> Nunca redesenhado pela IA. O arquivo original é aplicado após a geração com fidelidade total.
                </div>
              </div>
            )}

            {uploadCategory === 'reference' && (
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: 10 }}>
                ℹ️ <strong>DNA Visual Geral:</strong> Somente texto pré-processado descrevendo estilo, paleta, composição e atmosfera, sem uso de visão.
              </div>
            )}
          </form>
          <Notice {...action} />
        </Card>
      ) : null}

      <div style={{ height: 20 }} />
      {items.length ? (
        <div className="content-grid">
          {items.map((asset) => {
            const isProtectedIdentity =
              asset.category === 'protected_identity' ||
              asset.category === 'Gênio / Mascote';
            const isExactAsset = asset.category === 'exact_asset';
            const isVisualDna = !isProtectedIdentity && !isExactAsset;

            return (
              <Card key={asset.id}>
                {asset.mime_type.startsWith('image/') && asset.url ? (
                  <img className="asset-image" src={asset.url} loading="lazy" alt={asset.name} />
                ) : (
                  <div className="empty">
                    <File size={38} />
                  </div>
                )}
                <h3 style={{ marginTop: 16, overflowWrap: 'anywhere' }}>{asset.name}</h3>

                {/* 1. Categoria */}
                <div style={{ marginTop: 8, marginBottom: 8 }}>
                  {isExactAsset ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 9px',
                        borderRadius: 6,
                        background: '#f3e8ff',
                        color: '#6b21a8',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: '1px solid #d8b4fe',
                      }}
                    >
                      🎯 Asset Exato
                    </span>
                  ) : isProtectedIdentity ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 9px',
                        borderRadius: 6,
                        background: '#e0e7ff',
                        color: '#3730a3',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: '1px solid #c7d2fe',
                      }}
                    >
                      👤 Identidade Protegida
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 9px',
                        borderRadius: 6,
                        background: '#f1f5f9',
                        color: '#334155',
                        fontSize: '11px',
                        fontWeight: 700,
                        border: '1px solid #cbd5e1',
                      }}
                    >
                      🎨 DNA Visual Geral
                    </span>
                  )}
                </div>

                {/* 2. Agente que está associado */}
                <AssetAgents assetId={asset.id} agents={agents} canEdit={canEdit} />

                {/* 3. Nome da Identidade (se tiver sido informado) */}
                {Boolean(asset.identity_name) && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: '12px',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <span style={{ color: '#64748b', fontWeight: 500 }}>Nome da Identidade:</span>{' '}
                      <strong style={{ color: '#0f172a' }}>{asset.identity_name}</strong>
                    </span>
                    {isProtectedIdentity ? (
                      asset.is_master ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: '#fef3c7',
                            color: '#92400e',
                            fontSize: '10px',
                            fontWeight: 700,
                            border: '1px solid #fcd34d',
                          }}
                          title="Referência Mestre: enviada apenas quando esta identidade for necessária na cena."
                        >
                          ⭐ Referência Mestre
                        </span>
                      ) : canEdit ? (
                        <button
                          type="button"
                          disabled={settingMasterId === asset.id}
                          onClick={async () => {
                            setSettingMasterId(asset.id);
                            try {
                              await api('assets', 'PATCH', { action: 'set_master', id: asset.id });
                              router.refresh();
                            } catch (err) {
                              console.error('Falha ao definir como mestre:', err);
                            } finally {
                              setSettingMasterId(null);
                            }
                          }}
                          style={{
                            background: '#fffbeb',
                            border: '1px dashed #f59e0b',
                            color: '#b45309',
                            borderRadius: 4,
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 6px',
                            cursor: 'pointer',
                          }}
                          title="Definir esta imagem como a referência visual mestre única da identidade"
                        >
                          {settingMasterId === asset.id ? 'Definindo...' : '⭐ Tornar Mestre'}
                        </button>
                      ) : null
                    ) : null}
                  </div>
                )}

                {/* 4. Tamanho do arquivo */}
                <div style={{ marginTop: 6, fontSize: '12px', color: '#64748b' }}>
                  {isExactAsset
                    ? `Sobreposição: ${asset.placement || 'top_left'} (${asset.scale_percent ?? 20}%) · ${Math.ceil(asset.size / 1024)} KB`
                    : `${Math.ceil(asset.size / 1024)} KB`}
                </div>

                {/* 2. Status e Ação de Processamento */}
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  {isProtectedIdentity ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: asset.is_master ? '#fef3c7' : '#f8fafc',
                        color: asset.is_master ? '#92400e' : '#475569',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: asset.is_master ? '1px solid #fcd34d' : '1px solid #e2e8f0',
                      }}
                      title={
                        asset.is_master
                          ? 'Referência visual mestre direta enviada quando a identidade for necessária na cena.'
                          : 'Identidade cadastrada. O arquivo original é utilizado diretamente.'
                      }
                    >
                      {asset.is_master ? '⭐ Mestre visual direta' : '👤 Arquivo de identidade'}
                    </span>
                  ) : isExactAsset ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: '#f3e8ff',
                        color: '#6b21a8',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: '1px solid #d8b4fe',
                      }}
                      title="Arquivo original sobreposto com fidelidade 100% pós-geração."
                    >
                      🎯 Aplicação pós-geração
                    </span>
                  ) : asset.processing_status === 'processed' ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: '#ecfdf5',
                        color: '#047857',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: '1px solid #a7f3d0',
                      }}
                      title="Ativo interpretado e consolidado na base textual (0 chamadas de visão na geração)"
                    >
                      ✓ DNA Visual Ativo
                    </span>
                  ) : asset.processing_status === 'failed' ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: '#fef2f2',
                        color: '#b91c1c',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: '1px solid #fecaca',
                      }}
                      title={
                        asset.processing_error === 'rate_limit'
                          ? 'Limite temporário da OpenAI atingido (Rate limit). Clique em Processar para tentar novamente.'
                          : asset.processing_error || 'Erro no processamento'
                      }
                    >
                      ⚠ Falha ({asset.processing_error === 'rate_limit' ? 'Limite da API' : 'Erro'})
                    </span>
                  ) : reprocessingId === asset.id || asset.processing_status === 'processing' ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: '#fffbeb',
                        color: '#b45309',
                        fontSize: '11px',
                        fontWeight: 600,
                        border: '1px solid #fde68a',
                      }}
                    >
                      ⏳ Analisando agora...
                    </span>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: '#f8fafc',
                        color: '#64748b',
                        fontSize: '11px',
                        fontWeight: 500,
                        border: '1px solid #e2e8f0',
                      }}
                      title="Ativo original armazenado. Clique em 'Processar' se desejar extrair o DNA visual para geração."
                    >
                      ⚪ Não processado
                    </span>
                  )}

                  <div style={{ display: 'flex', gap: 4 }}>
                    {asset.summary_text ? (
                      <Button
                        secondary
                        style={{ padding: '2px 8px', fontSize: '11px', height: 24 }}
                        onClick={() => setViewDnaAsset(asset)}
                      >
                        Ver DNA
                      </Button>
                    ) : null}
                    {canEdit ? (
                      isProtectedIdentity || isExactAsset ? (
                        <Button
                          secondary
                          disabled
                          style={{
                            padding: '2px 8px',
                            fontSize: '11px',
                            height: 24,
                            opacity: 0.5,
                            cursor: 'not-allowed',
                          }}
                          title="O processamento textual não se aplica a esta categoria. O arquivo original é utilizado diretamente."
                        >
                          Processar
                        </Button>
                      ) : (asset.processing_status !== 'processed' || !asset.summary_text) ? (
                        <Button
                          secondary
                          busy={reprocessingId === asset.id}
                          style={{ padding: '2px 8px', fontSize: '11px', height: 24 }}
                          onClick={() => handleReprocess(asset.id)}
                        >
                          Processar
                        </Button>
                      ) : null
                    ) : null}
                  </div>
                </div>

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
          );
        })}
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
            onClick={() => router.push(`/library?${new URLSearchParams({...Object.fromEntries(searchParams),page:String(page-1)})}`)}
          >
            {t('previous')}
          </Button>
          {pageBlock(page, total).map(number => (
            <Button key={number} secondary={number !== page} aria-current={number === page ? 'page' : undefined}
              aria-label={`Página ${number}`} onClick={() => router.push(`/library?${new URLSearchParams({...Object.fromEntries(searchParams),page:String(number)})}`)}>{number}</Button>
          ))}
          <Button
            secondary
            disabled={page * 24 >= total}
            onClick={() => router.push(`/library?${new URLSearchParams({...Object.fromEntries(searchParams),page:String(page+1)})}`)}
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
          <Field label="Categoria do Ativo">
            <select
              value={edit.category}
              onChange={(e) =>
                setEdit({
                  ...edit,
                  category: e.target.value as 'reference' | 'protected_identity' | 'exact_asset',
                })
              }
            >
              <option value="reference">DNA Visual Geral</option>
              <option value="protected_identity">Identidade Protegida</option>
              <option value="exact_asset">Asset Exato</option>
            </select>
          </Field>

          {edit.category === 'protected_identity' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                margin: '10px 0',
                padding: 14,
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
              }}
            >
              <Field label="Nome da Identidade">
                <input
                  value={edit.identity_name || ''}
                  placeholder="Ex: Nome da pessoa, personagem, produto ou elemento visual recorrente..."
                  onChange={(e) => setEdit({ ...edit, identity_name: e.target.value })}
                />
              </Field>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
                <label className="check" style={{ fontSize: '13px', margin: 0, fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(edit.is_master)}
                    onChange={(e) => setEdit({ ...edit, is_master: e.target.checked })}
                  />
                  ⭐ Definir como Referência Mestre
                </label>
                <span style={{ fontSize: '12px', color: '#64748b', marginLeft: 24 }}>
                  Apenas uma imagem por identidade pode ser mestre e ela será usada como base quando essa identidade for necessária em uma cena.
                </span>
              </div>
            </div>
          )}

          {edit.category === 'exact_asset' && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
                margin: '10px 0',
                padding: 12,
                background: '#f5f3ff',
                borderRadius: 8,
                border: '1px solid #ddd6fe',
              }}
            >
              <Field label="Tipo do Asset Exato">
                <select
                  value={edit.asset_subtype || 'logo'}
                  onChange={(e) =>
                    setEdit({ ...edit, asset_subtype: e.target.value as any })
                  }
                >
                  <option value="logo">Logotipo</option>
                  <option value="badge">Selo / Emblema</option>
                  <option value="watermark">Marca d'Água</option>
                  <option value="other">Outro</option>
                </select>
              </Field>
              <Field label="Posicionamento">
                <select
                  value={edit.placement || 'top_left'}
                  onChange={(e) =>
                    setEdit({ ...edit, placement: e.target.value as any })
                  }
                >
                  <option value="top_left">Canto Superior Esquerdo</option>
                  <option value="top_right">Canto Superior Direito</option>
                  <option value="bottom_left">Canto Inferior Esquerdo</option>
                  <option value="bottom_right">Canto Inferior Direito</option>
                  <option value="manual">Manual (Sem Sobreposição)</option>
                </select>
              </Field>
              <Field label="Tamanho (% da largura)">
                <input
                  type="number"
                  min={5}
                  max={100}
                  step={1}
                  value={edit.scale_percent ?? 22}
                  placeholder="20"
                  onChange={(e) =>
                    setEdit({ ...edit, scale_percent: Number(e.target.value) })
                  }
                />
              </Field>
              <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#64748b' }}>
                Padrão recomendado: 20% a 22%. A proporção e a fidelidade do arquivo original são sempre preservadas sem distorção.
              </div>
            </div>
          )}

          <div style={{ paddingTop: 10 }}>
            <Button
              busy={action.busy}
              onClick={() =>
                action.act(async () => {
                  await api('assets', 'PATCH', {
                    id: edit.id,
                    name: edit.name,
                    category: edit.category,
                    identity_name:
                      edit.category === 'protected_identity' ? edit.identity_name || null : null,
                    is_master:
                      edit.category === 'protected_identity' ? Boolean(edit.is_master) : false,
                    asset_subtype:
                      edit.category === 'exact_asset' ? edit.asset_subtype || 'logo' : null,
                    placement:
                      edit.category === 'exact_asset' ? edit.placement || 'top_left' : null,
                    scale_percent:
                      edit.category === 'exact_asset' ? (edit.scale_percent ?? 20) : null,
                  });
                  setEdit(null);
                  router.refresh();
                })
              }
            >
              {t('save')}
            </Button>
          </div>
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

      {/* Solicitar Mais Armazenamento Popup — Usuários comuns */}
      {requestModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
          onClick={() => setRequestModalOpen(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 20,
              padding: '36px 32px 32px',
              maxWidth: 480,
              width: '100%',
              position: 'relative',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setRequestModalOpen(false)}
              style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: 6,
                borderRadius: 6,
                display: 'grid',
                placeItems: 'center',
              }}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>

            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 22,
                background: '#fffbeb',
                border: '1px solid #fef08a',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Lock size={32} color="#f59e0b" strokeWidth={2.4} />
            </div>

            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: '#0f172a',
                margin: '0 0 16px',
                letterSpacing: '-0.02em',
              }}
            >
              Acesso Restrito
            </h2>

            <p
              style={{
                fontSize: '15px',
                color: '#334155',
                lineHeight: 1.6,
                margin: '0 0 28px',
              }}
            >
              Entre em contato com o Administrador para solicitar mais espaço de armazenamento pelo WhatsApp{' '}
              <a
                href="https://wa.me/5519988788759"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
              >
                (19) 98878-8759
              </a>.
            </p>

            <button
              type="button"
              onClick={() => setRequestModalOpen(false)}
              style={{
                width: '100%',
                padding: '13px 24px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                transition: 'opacity 0.15s ease',
              }}
            >
              Entendi
            </button>
          </div>
        </div>
      )}
      {/* Modal Ver DNA Visual */}
      {viewDnaAsset && (
        <Modal
          title={`DNA Visual: ${viewDnaAsset.name}`}
          subtitle="Conhecimento interpretado pela IA e reutilizado no gerador de imagens sem reenviar arquivos originais."
          onClose={() => setViewDnaAsset(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '65vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontSize: '12px' }}>
                Modelo: <strong>{viewDnaAsset.processor_model || 'gpt-4o-mini'}</strong>
              </span>
              <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontSize: '12px' }}>
                Hash: <code>{viewDnaAsset.content_hash ? viewDnaAsset.content_hash.slice(0, 12) + '...' : 'N/A'}</code>
              </span>
              {viewDnaAsset.processed_at && (
                <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', color: '#475569', fontSize: '12px' }}>
                  Processado em: {new Date(viewDnaAsset.processed_at).toLocaleString('pt-BR')}
                </span>
              )}
            </div>

            {viewDnaAsset.textual_interpretation && typeof viewDnaAsset.textual_interpretation === 'object' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                {Boolean((viewDnaAsset.textual_interpretation as Record<string, unknown>).art_style) && (
                  <div>
                    <strong style={{ fontSize: '12px', color: '#334155' }}>Estilo Artístico:</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#0f172a' }}>
                      {String((viewDnaAsset.textual_interpretation as Record<string, unknown>).art_style)}
                    </p>
                  </div>
                )}
                {Boolean((viewDnaAsset.textual_interpretation as Record<string, unknown>).brand_identity_and_mood) && (
                  <div>
                    <strong style={{ fontSize: '12px', color: '#334155' }}>Identidade e Clima:</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#0f172a' }}>
                      {String((viewDnaAsset.textual_interpretation as Record<string, unknown>).brand_identity_and_mood)}
                    </p>
                  </div>
                )}
                {Array.isArray((viewDnaAsset.textual_interpretation as Record<string, unknown>).predominant_colors) && (
                  <div>
                    <strong style={{ fontSize: '12px', color: '#334155' }}>Cores Mandatórias:</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {((viewDnaAsset.textual_interpretation as Record<string, unknown>).predominant_colors as string[]).map((c, i) => (
                        <span key={i} style={{ padding: '2px 8px', borderRadius: 4, background: '#e0e7ff', color: '#3730a3', fontSize: '12px', fontWeight: 600 }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {Boolean((viewDnaAsset.textual_interpretation as Record<string, unknown>).characters_and_mascots) &&
                  String((viewDnaAsset.textual_interpretation as Record<string, unknown>).characters_and_mascots) !== 'Nenhum' && (
                  <div>
                    <strong style={{ fontSize: '12px', color: '#334155' }}>Personagens / Mascotes:</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#0f172a' }}>
                      {String((viewDnaAsset.textual_interpretation as Record<string, unknown>).characters_and_mascots)}
                    </p>
                  </div>
                )}
                {Boolean((viewDnaAsset.textual_interpretation as Record<string, unknown>).generation_guidelines) && (
                  <div>
                    <strong style={{ fontSize: '12px', color: '#334155' }}>Diretriz para o Gerador:</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#0f172a' }}>
                      {String((viewDnaAsset.textual_interpretation as Record<string, unknown>).generation_guidelines)}
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            <div>
              <strong style={{ fontSize: '12px', color: '#334155' }}>Resumo Injetado no Contexto da Geração:</strong>
              <div style={{ marginTop: 4, padding: 10, background: '#f1f5f9', borderRadius: 6, fontSize: '12px', color: '#1e293b', lineHeight: 1.5 }}>
                {viewDnaAsset.summary_text || 'Sem resumo disponível.'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              {canEdit ? (
                <Button
                  secondary
                  busy={reprocessingId === viewDnaAsset.id}
                  onClick={async () => {
                    await handleReprocess(viewDnaAsset.id);
                    setViewDnaAsset(null);
                  }}
                >
                  Reprocessar com IA
                </Button>
              ) : null}
              <Button onClick={() => setViewDnaAsset(null)}>Fechar</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
