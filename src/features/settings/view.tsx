'use client';
import { useState } from 'react';
import { BrainCircuit, Bot, FileText, Image, Database, Camera, Trash2, HardDrive } from 'lucide-react';
import { Button, Card, Field, Notice, useT, useLocale, useAction, api } from '@/components/ui';
import type { AIConfig, ProviderId } from '@/lib/domain';
import { ModelPicker } from './model-picker';
import { CredentialPanel, type CredentialStatus } from './credential-panel';

export type SettingsQuotaUser = {
  id: string;
  name: string;
  email: string;
  usedBytes: number;
  quotaMB: number;
  isUnlimited: boolean;
  role: string;
};

export function SettingsView({
  configs,
  credentials,
  profile,
  company,
  canAdmin,
  isSuperAdmin = false,
  initialTab = 'ai',
  initialQuotaUsers = [],
}: {
  configs: AIConfig[];
  credentials: CredentialStatus | null;
  profile: { name: string; email: string; avatarUrl?: string };
  company: { name: string; timezone: string };
  canAdmin: boolean;
  isSuperAdmin?: boolean;
  initialTab?: string;
  initialQuotaUsers?: SettingsQuotaUser[];
}) {
  const t = useT(),
    locale = useLocale(),
    action = useAction(),
    [tab, setTab] = useState(initialTab),
    [models, setModels] = useState<AIConfig[]>(configs),
    [avatar, setAvatar] = useState(profile.avatarUrl || ''),
    [avatarBusy, setAvatarBusy] = useState(false),
    [quotaUsers, setQuotaUsers] = useState<SettingsQuotaUser[]>(initialQuotaUsers),
    [selectedUserId, setSelectedUserId] = useState<string>(initialQuotaUsers[0]?.id || ''),
    [userQuotaEdit, setUserQuotaEdit] = useState<{ value: number; unlimited: boolean }>({
      value: initialQuotaUsers[0]?.quotaMB === -1 ? 100 : (initialQuotaUsers[0]?.quotaMB ?? 100),
      unlimited: initialQuotaUsers[0]?.isUnlimited ?? false,
    }),
    [savingQuota, setSavingQuota] = useState(false),
    [quotaNotice, setQuotaNotice] = useState<{ message: string; error?: boolean } | null>(null);

  const handleSelectUser = (id: string) => {
    setSelectedUserId(id);
    const u = quotaUsers.find((x) => x.id === id);
    if (u) {
      setUserQuotaEdit({
        value: u.quotaMB === -1 ? 100 : u.quotaMB,
        unlimited: u.isUnlimited,
      });
    }
    setQuotaNotice(null);
  };

  const handleSaveUserQuota = async () => {
    if (!selectedUserId) return;
    setSavingQuota(true);
    setQuotaNotice(null);
    try {
      const targetQuota = userQuotaEdit.unlimited ? -1 : Number(userQuotaEdit.value);
      await api('assets/quota', 'POST', { userId: selectedUserId, quotaMB: targetQuota });
      setQuotaUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserId
            ? { ...u, quotaMB: targetQuota, isUnlimited: targetQuota === -1 }
            : u,
        ),
      );
      setQuotaNotice({ message: 'Cota de armazenamento do usuário atualizada com sucesso!' });
    } catch {
      setQuotaNotice({ message: 'Erro ao salvar cota de armazenamento.', error: true });
    } finally {
      setSavingQuota(false);
    }
  };

  const selectedUser = quotaUsers.find((u) => u.id === selectedUserId);

  const sections = [
    'profile',
    'security',
    'ai',
    'credentials',
    'company',
    'preferences',
    ...(isSuperAdmin ? ['library'] : []),
  ];
  const purposes = ['orchestrator', 'text', 'image', 'embedding'] as const;
  const icons = [Bot, FileText, Image, Database];
  function change(purpose: AIConfig['purpose'], field: 'provider' | 'model', value: string) {
    const old = models.find((m) => m.purpose === purpose) || {
      purpose,
      provider: 'openai' as ProviderId,
      model: '',
    };
    setModels([
      ...models.filter((m) => m.purpose !== purpose),
      { ...old, [field]: value, ...(field === 'provider' ? { model: '' } : {}) },
    ]);
  }
  return (
    <>
      <div className="page-heading">
        <h1>{t('settings')}</h1>
        <p>
          {t('preferences')} · {t('company')} · {t('ai')}
        </p>
      </div>
      <div className="settings-grid">
        <Card className="settings-nav">
          {sections.map((s) => (
            <button className={tab === s ? 'active' : ''} key={s} onClick={() => setTab(s)}>
              {t(s)}
            </button>
          ))}
        </Card>
        <div>
          {tab === 'ai' ? (
            <>
              <div className="ai-banner">
                <BrainCircuit size={38} color="var(--blue)" />
                <div>
                  <h2>{t('ai')}</h2>
                  <small>
                    {t('orchestrator')} · {t('textModel')} · {t('imageModel')}
                  </small>
                </div>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.act(async () => {
                    await api('settings', 'POST', {
                      action: 'models',
                      configs: models.filter((m) => m.model.trim()),
                    });
                  });
                }}
              >
                <div className="grid three">
                  {purposes.map((purpose, i) => {
                    const config = models.find((m) => m.purpose === purpose),
                      Icon = icons[i];
                    return (
                      <Card className="model-card" key={purpose}>
                        <h3 className="check">
                          <Icon size={24} />
                          {t(['orchestrator', 'textModel', 'imageModel', 'embeddingModel'][i])}
                        </h3>
                        <Field label={t('provider')}>
                          <select
                            disabled={!canAdmin}
                            value={config?.provider || 'openai'}
                            onChange={(e) => change(purpose, 'provider', e.target.value)}
                          >
                            {(purpose === 'embedding'
                              ? ['openai']
                              : purpose === 'image'
                                ? ['openai', 'google']
                                : ['openai', 'anthropic', 'google']
                            ).map((p) => (
                              <option key={p} value={p}>
                                {p === 'openai'
                                  ? 'OpenAI'
                                  : p === 'anthropic'
                                    ? 'Anthropic'
                                    : 'Google'}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <ModelPicker
                          provider={config?.provider || 'openai'}
                          purpose={purpose}
                          value={config?.model || ''}
                          disabled={!canAdmin}
                          onChange={(value) => change(purpose, 'model', value)}
                        />
                      </Card>
                    );
                  })}
                </div>
                {canAdmin ? (
                  <Button style={{ marginTop: 20 }} busy={action.busy} type="submit">
                    {t('save')}
                  </Button>
                ) : null}
              </form>
            </>
          ) : null}
          {canAdmin && (tab === 'credentials' || tab === 'ai') ? (
            <CredentialPanel initial={credentials} />
          ) : null}
          {tab === 'profile' || tab === 'preferences' ? (
            <Card>
              <div className="profile-avatar-section">
                <div className="profile-avatar-preview">
                  {avatar ? (
                    <img src={avatar} alt={profile.name || 'Avatar'} className="avatar-img-large" />
                  ) : (
                    <div className="avatar-placeholder-large">
                      {(profile.name || 'U').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="profile-avatar-actions">
                  <h3>{t('profilePhoto')}</h3>
                  <p className="muted" style={{ fontSize: '0.85rem' }}>{t('uploadPhotoHint')}</p>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <input
                      type="file"
                      id="profile-avatar-input"
                      accept="image/png,image/jpeg,image/webp"
                      style={{ display: 'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setAvatarBusy(true);
                        try {
                          const formData = new FormData();
                          formData.append('avatar', file);
                          const res = await fetch('/api/settings', {
                            method: 'POST',
                            body: formData,
                          });
                          const json = await res.json();
                          if (json.avatar_url) {
                            setAvatar(json.avatar_url);
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setAvatarBusy(false);
                        }
                      }}
                    />
                    <Button
                      secondary
                      busy={avatarBusy}
                      type="button"
                      onClick={() => document.getElementById('profile-avatar-input')?.click()}
                    >
                      <Camera size={16} />
                      {t('changePhoto')}
                    </Button>
                    {avatar ? (
                      <Button
                        secondary
                        busy={avatarBusy}
                        type="button"
                        onClick={async () => {
                          setAvatarBusy(true);
                          try {
                            await api('settings', 'POST', { action: 'remove_avatar' });
                            setAvatar('');
                          } finally {
                            setAvatarBusy(false);
                          }
                        }}
                      >
                        <Trash2 size={16} />
                        {t('removePhoto')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }} />

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void action.act(async () => {
                    await api('settings', 'POST', {
                      action: 'profile',
                      name: data.get('name'),
                      locale: data.get('locale'),
                      avatar_url: avatar,
                    });
                    location.reload();
                  });
                }}
              >
                <Field label={t('name')}>
                  <input name="name" defaultValue={profile.name} maxLength={160} />
                </Field>
                <Field label={t('email')}>
                  <input value={profile.email} readOnly type="email" />
                </Field>
                <Field label={t('locale')}>
                  <select name="locale" defaultValue={locale}>
                    {['pt-BR', 'en-US', 'es-ES'].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Button busy={action.busy} type="submit">
                  {t('save')}
                </Button>
              </form>
            </Card>
          ) : null}
          {tab === 'security' ? (
            <Card>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void action.act(async () => {
                    await api('settings', 'POST', {
                      action: 'password',
                      password: data.get('password'),
                    });
                  }, 'passwordUpdated');
                }}
              >
                <Field label={t('newPassword')}>
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                  <small>{t('passwordHint')}</small>
                </Field>
                <Button busy={action.busy} type="submit">
                  {t('save')}
                </Button>
              </form>
            </Card>
          ) : null}
          {tab === 'company' ? (
            <Card>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  void action.act(async () => {
                    await api('settings', 'POST', {
                      action: 'company',
                      name: data.get('name'),
                      timezone: data.get('timezone'),
                    });
                  });
                }}
              >
                <Field label={t('name')}>
                  <input
                    name="name"
                    defaultValue={company.name}
                    disabled={!canAdmin}
                    required
                    minLength={2}
                  />
                </Field>
                <Field label={t('timezone')}>
                  <input
                    name="timezone"
                    defaultValue={company.timezone}
                    disabled={!canAdmin}
                    required
                  />
                </Field>
                {canAdmin ? (
                  <Button type="submit" busy={action.busy}>
                    {t('save')}
                  </Button>
                ) : null}
              </form>
            </Card>
          ) : null}

          {tab === 'library' && isSuperAdmin ? (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: '#eff6ff',
                    color: '#2563eb',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <HardDrive size={24} />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#0f172a' }}>
                    Gestão de Armazenamento da Biblioteca
                  </h2>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                    Área restrita do Super Admin: libere mais espaço selecionando o usuário cadastrado individualmente.
                  </p>
                </div>
              </div>

              {/* Individual User Selection & Edit Panel */}
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  padding: 22,
                  marginBottom: 28,
                }}
              >
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: 16 }}>
                  Selecionar Usuário para Ajuste de Espaço
                </h3>

                <div style={{ maxWidth: 520, marginBottom: 20 }}>
                  <Field label="Usuário Cadastrado">
                    <select
                      value={selectedUserId}
                      onChange={(e) => handleSelectUser(e.target.value)}
                      style={{ background: '#ffffff' }}
                    >
                      <option value="">Selecione um usuário...</option>
                      {quotaUsers.map((u) => {
                        const uMB = (u.usedBytes / (1024 * 1024)).toFixed(1);
                        return (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role}) — {u.isUnlimited ? 'Ilimitado' : `${u.quotaMB} MB`} ({uMB} MB em uso)
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                </div>

                {selectedUser ? (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      padding: 20,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                        marginBottom: 20,
                        paddingBottom: 16,
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '16px', color: '#0f172a' }}>{selectedUser.name}</strong>
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: 3 }}>
                          Papel: <strong>{selectedUser.role}</strong> · Em uso: <strong>{(selectedUser.usedBytes / (1024 * 1024)).toFixed(1)} MB</strong>
                        </div>
                      </div>
                      <div>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '4px 12px',
                            borderRadius: 20,
                            fontSize: '12px',
                            fontWeight: 600,
                            background: selectedUser.isUnlimited ? '#ecfdf5' : '#eff6ff',
                            color: selectedUser.isUnlimited ? '#059669' : '#2563eb',
                          }}
                        >
                          {selectedUser.isUnlimited ? 'Armazenamento Ilimitado' : `Cota Atual: ${selectedUser.quotaMB} MB`}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      {/* b) indicar como "ilimitado" */}
                      <label className="check" style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={userQuotaEdit.unlimited}
                          onChange={(e) =>
                            setUserQuotaEdit({ ...userQuotaEdit, unlimited: e.target.checked })
                          }
                        />
                        Indicar como "Ilimitado" (sem restrição de megas)
                      </label>

                      {/* a) especificar a quantidade de megas da conta */}
                      {!userQuotaEdit.unlimited && (
                        <div style={{ maxWidth: 320 }}>
                          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                            Quantidade de megas da conta:
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="number"
                              min={1}
                              max={100000}
                              style={{
                                width: 140,
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                fontSize: '14px',
                                fontWeight: 600,
                              }}
                              value={userQuotaEdit.value}
                              onChange={(e) =>
                                setUserQuotaEdit({
                                  ...userQuotaEdit,
                                  value: Math.max(1, Number(e.target.value)),
                                })
                              }
                            />
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#64748b' }}>MB</span>
                          </div>
                          <small style={{ display: 'block', fontSize: '12px', color: '#64748b', marginTop: 4 }}>
                            Padrão do sistema: 100 MB
                          </small>
                        </div>
                      )}

                      <div style={{ paddingTop: 8 }}>
                        <Button busy={savingQuota} type="button" onClick={handleSaveUserQuota}>
                          Salvar Cota do Usuário
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
                    Selecione um usuário acima para ajustar sua cota de armazenamento.
                  </p>
                )}
              </div>

              {/* Overview Table of All Users */}
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
                Todos os Usuários Cadastrados ({quotaUsers.length})
              </h3>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Usuário</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Papel</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Em Uso</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600 }}>Capacidade</th>
                      <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotaUsers.map((u) => {
                      const uMB = (u.usedBytes / (1024 * 1024)).toFixed(1);
                      const isSelected = u.id === selectedUserId;
                      return (
                        <tr
                          key={u.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: isSelected ? '#f0fdf4' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 600, color: '#0f172a' }}>
                            {u.name}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.role}</td>
                          <td style={{ padding: '10px 14px', color: '#0f172a' }}>{uMB} MB</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                padding: '2px 8px',
                                borderRadius: 12,
                                fontSize: '12px',
                                fontWeight: 600,
                                background: u.isUnlimited ? '#ecfdf5' : '#eff6ff',
                                color: u.isUnlimited ? '#059669' : '#2563eb',
                              }}
                            >
                              {u.isUnlimited ? 'Ilimitado' : `${u.quotaMB} MB`}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <Button
                              secondary
                              type="button"
                              onClick={() => handleSelectUser(u.id)}
                              style={{ padding: '4px 10px', fontSize: '12px' }}
                            >
                              {isSelected ? 'Selecionado' : 'Selecionar'}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {quotaNotice && (
                <div style={{ marginTop: 16 }}>
                  <Notice message={quotaNotice.message} error={quotaNotice.error} />
                </div>
              )}
            </Card>
          ) : null}

          <Notice {...action} />
        </div>
      </div>
    </>
  );
}
