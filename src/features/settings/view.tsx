'use client';
import { useState } from 'react';
import {
  BrainCircuit,
  Bot,
  FileText,
  Image,
  Database,
  Camera,
  Trash2,
  HardDrive,
  Users,
  UserCheck,
  UserX,
  Ban,
  KeyRound,
  ShieldAlert,
  History,
  Edit3,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Coins,
} from 'lucide-react';
import { Button, Card, Field, Notice, Modal, useT, useLocale, useAction, api } from '@/components/ui';
import type { AIConfig, ProviderId, AdminUserDetail, UserStatus, QuotaAdjustmentLog } from '@/lib/domain';
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
  initialAdminUsers = [],
  globalImageQuality = 'low',
}: {
  configs: AIConfig[];
  credentials: CredentialStatus | null;
  profile: { name: string; email: string; avatarUrl?: string };
  company: { name: string; timezone: string };
  canAdmin: boolean;
  isSuperAdmin?: boolean;
  initialTab?: string;
  initialQuotaUsers?: SettingsQuotaUser[];
  initialAdminUsers?: AdminUserDetail[];
  globalImageQuality?: string;
}) {
  const t = useT(),
    locale = useLocale(),
    action = useAction(),
    [tab, setTab] = useState(
      !isSuperAdmin && ['ai', 'credentials', 'library', 'users'].includes(initialTab)
        ? 'profile'
        : initialTab,
    ),
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
    [quotaNotice, setQuotaNotice] = useState<{ message: string; error?: boolean } | null>(null),
    [globalQuality, setGlobalQuality] = useState<'low' | 'medium' | 'high'>(
      (globalImageQuality as 'low' | 'medium' | 'high') || 'low',
    ),
    [savingQuality, setSavingQuality] = useState(false),
    [qualityNotice, setQualityNotice] = useState<{ message: string; error?: boolean } | null>(null),
    // Super Admin Users Tab State
    [adminUsers, setAdminUsers] = useState<AdminUserDetail[]>(initialAdminUsers),
    [userSearch, setUserSearch] = useState(''),
    [selectedUserForQuota, setSelectedUserForQuota] = useState<AdminUserDetail | null>(null),
    [quotaModalValue, setQuotaModalValue] = useState<number>(100),
    [quotaModalUnlimited, setQuotaModalUnlimited] = useState<boolean>(false),
    [quotaModalReason, setQuotaModalReason] = useState<string>(''),
    [savingQuotaModal, setSavingQuotaModal] = useState<boolean>(false),
    [selectedUserForDelete, setSelectedUserForDelete] = useState<AdminUserDetail | null>(null),
    [deletingUser, setDeletingUser] = useState<boolean>(false),
    [userStatusBusyId, setUserStatusBusyId] = useState<string | null>(null),
    [userResetBusyId, setUserResetBusyId] = useState<string | null>(null),
    [usersNotice, setUsersNotice] = useState<{ message: string; error?: boolean } | null>(null),
    [selectedUserForContentQuota, setSelectedUserForContentQuota] = useState<AdminUserDetail | null>(null),
    [contentQuotaMode, setContentQuotaMode] = useState<'add' | 'set'>('add'),
    [contentQuotaAmount, setContentQuotaAmount] = useState<number>(50),
    [contentQuotaReason, setContentQuotaReason] = useState<string>(''),
    [savingContentQuota, setSavingContentQuota] = useState<boolean>(false);

  const handleSaveGlobalQuality = async () => {
    setSavingQuality(true);
    setQualityNotice(null);
    try {
      await api('settings', 'POST', {
        action: 'image_quality',
        quality: globalQuality,
      });
      setQualityNotice({ message: 'Qualidade global da imagem atualizada com sucesso!' });
    } catch {
      setQualityNotice({ message: 'Erro ao salvar qualidade global da imagem.', error: true });
    } finally {
      setSavingQuality(false);
    }
  };

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

  const handleOpenQuotaModal = (u: AdminUserDetail) => {
    setSelectedUserForQuota(u);
    setQuotaModalValue(u.storage_quota_mb === -1 ? 100 : u.storage_quota_mb);
    setQuotaModalUnlimited(u.is_unlimited);
    setQuotaModalReason('');
  };

  const handleSaveQuotaModal = async () => {
    if (!selectedUserForQuota) return;
    setSavingQuotaModal(true);
    setUsersNotice(null);
    try {
      const quotaMB = quotaModalUnlimited ? -1 : Number(quotaModalValue);
      const res = await api('super-admin/users', 'PATCH', {
        action: 'quota',
        userId: selectedUserForQuota.id,
        quotaMB,
        reason: quotaModalReason.trim() || undefined,
      });
      const newLog = res.auditLog;
      setAdminUsers((prev) =>
        prev.map((u) => {
          if (u.id === selectedUserForQuota.id) {
            return {
              ...u,
              storage_quota_mb: quotaMB,
              is_unlimited: quotaMB === -1,
              adjustment_history: newLog
                ? [newLog, ...(u.adjustment_history || [])]
                : u.adjustment_history,
            };
          }
          return u;
        }),
      );
      setQuotaUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUserForQuota.id
            ? { ...u, quotaMB, isUnlimited: quotaMB === -1 }
            : u,
        ),
      );
      setUsersNotice({
        message: `Limite de armazenamento de "${selectedUserForQuota.name}" atualizado com sucesso!`,
      });
      setSelectedUserForQuota(null);
    } catch (err: any) {
      setUsersNotice({
        message: `Erro ao ajustar limite: ${err.message || 'Erro inesperado'}`,
        error: true,
      });
    } finally {
      setSavingQuotaModal(false);
    }
  };

  const handleOpenContentQuotaModal = (u: AdminUserDetail) => {
    setSelectedUserForContentQuota(u);
    setContentQuotaMode('add');
    setContentQuotaAmount(50);
    setContentQuotaReason('');
  };

  const handleSaveContentQuota = async () => {
    if (!selectedUserForContentQuota) return;
    setSavingContentQuota(true);
    setUsersNotice(null);
    try {
      const res = await api('super-admin/users', 'PATCH', {
        action: 'assign_content_quota',
        userId: selectedUserForContentQuota.id,
        amount: Number(contentQuotaAmount),
        mode: contentQuotaMode,
        reason: contentQuotaReason.trim() || undefined,
      });

      const newTx = res.transaction;
      const newBalance = res.balance;

      setAdminUsers((prev) =>
        prev.map((u) => {
          if (u.id === selectedUserForContentQuota.id) {
            const prevAssigned = u.content_quota_total_assigned ?? 0;
            return {
              ...u,
              content_quota_balance: newBalance,
              content_quota_total_assigned:
                contentQuotaMode === 'add'
                  ? prevAssigned + Number(contentQuotaAmount)
                  : prevAssigned,
              quota_transactions: newTx
                ? [newTx, ...(u.quota_transactions || [])]
                : u.quota_transactions,
            };
          }
          return u;
        }),
      );

      setUsersNotice({
        message: `Cotas de conteúdo de "${selectedUserForContentQuota.name}" atualizadas com sucesso! Novo saldo: ${newBalance} cotas.`,
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('quota-updated'));
      }

      setSelectedUserForContentQuota(null);
    } catch (err: any) {
      setUsersNotice({
        message: `Erro ao atribuir cotas: ${err.message || 'Erro inesperado'}`,
        error: true,
      });
    } finally {
      setSavingContentQuota(false);
    }
  };

  const handleUpdateStatus = async (userId: string, newStatus: UserStatus) => {
    setUserStatusBusyId(userId);
    setUsersNotice(null);
    try {
      await api('super-admin/users', 'PATCH', { action: 'status', userId, status: newStatus });
      setAdminUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)),
      );
      const label = newStatus === 'active' ? 'Ativo' : newStatus === 'inactive' ? 'Inativo' : 'Bloqueado';
      setUsersNotice({ message: `Status do usuário atualizado para "${label}".` });
    } catch (err: any) {
      setUsersNotice({
        message: `Erro ao atualizar status: ${err.message || 'Erro inesperado'}`,
        error: true,
      });
    } finally {
      setUserStatusBusyId(null);
    }
  };

  const handleResetPassword = async (userId: string, email: string) => {
    setUserResetBusyId(userId);
    setUsersNotice(null);
    try {
      await api('super-admin/users', 'PATCH', { action: 'reset_password', userId });
      setUsersNotice({
        message: `E-mail de redefinição de senha enviado com sucesso para ${email}!`,
      });
    } catch (err: any) {
      setUsersNotice({
        message: `Erro ao enviar e-mail de redefinição: ${err.message || 'Erro inesperado'}`,
        error: true,
      });
    } finally {
      setUserResetBusyId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedUserForDelete) return;
    setDeletingUser(true);
    setUsersNotice(null);
    try {
      await api(`super-admin/users?userId=${selectedUserForDelete.id}`, 'DELETE', {
        userId: selectedUserForDelete.id,
      });
      setAdminUsers((prev) => prev.filter((u) => u.id !== selectedUserForDelete.id));
      setQuotaUsers((prev) => prev.filter((u) => u.id !== selectedUserForDelete.id));
      setUsersNotice({
        message: `Usuário "${selectedUserForDelete.name}" excluído com sucesso.`,
      });
      setSelectedUserForDelete(null);
    } catch (err: any) {
      setUsersNotice({
        message: `Erro ao excluir usuário: ${err.message || 'Erro inesperado'}`,
        error: true,
      });
    } finally {
      setDeletingUser(false);
    }
  };

  const filteredUsers = adminUsers.filter((u) => {
    if (!userSearch.trim()) return true;
    const term = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term) ||
      u.status.toLowerCase().includes(term)
    );
  });

  const selectedUser = quotaUsers.find((u) => u.id === selectedUserId);

  const sections = [
    'profile',
    'security',
    ...(isSuperAdmin ? ['ai', 'credentials'] : []),
    'company',
    'preferences',
    ...(isSuperAdmin ? ['library', 'users'] : []),
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
          {t('preferences')} · {t('company')}
          {isSuperAdmin ? ` · ${t('ai')}` : ''}
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
          {tab === 'ai' && isSuperAdmin ? (
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
              {isSuperAdmin ? (
                <Card className="super-admin-quality-card" style={{ marginTop: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Image size={22} color="var(--blue)" />
                      <h3 style={{ margin: 0 }}>Qualidade da Imagem (Configuração Global)</h3>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'rgba(59, 130, 246, 0.15)', color: 'var(--blue)' }}>
                      Super Admin
                    </span>
                  </div>
                  <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                    Define a qualidade de imagem padrão do sistema. Multiplicadores internos de consumo: <strong>low = 1x</strong>, <strong>medium = 3x</strong>, <strong>high = 9x</strong>.
                  </p>
                  <div style={{ maxWidth: 360, marginBottom: 16 }}>
                    <Field label="Qualidade da Imagem">
                      <select
                        value={globalQuality}
                        onChange={(e) => setGlobalQuality(e.target.value as 'low' | 'medium' | 'high')}
                      >
                        <option value="low">low (Padrão — 1x)</option>
                        <option value="medium">medium (3x)</option>
                        <option value="high">high (9x)</option>
                      </select>
                    </Field>
                  </div>
                  <Button
                    busy={savingQuality}
                    type="button"
                    onClick={handleSaveGlobalQuality}
                  >
                    Salvar Qualidade da Imagem
                  </Button>
                  {qualityNotice && (
                    <div style={{ marginTop: 12 }}>
                      <Notice message={qualityNotice.message} error={qualityNotice.error} />
                    </div>
                  )}
                </Card>
              ) : null}
            </>
          ) : null}
          {isSuperAdmin && (tab === 'credentials' || tab === 'ai') ? (
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
                            {u.name}{u.email ? ` • ${u.email}` : ''} ({u.role}) — {u.isUnlimited ? 'Ilimitado' : `${u.quotaMB} MB`} ({uMB} MB em uso)
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
                        {selectedUser.email ? (
                          <span style={{ fontSize: '13px', color: '#64748b', marginLeft: 8 }}>({selectedUser.email})</span>
                        ) : null}
                        <div style={{ fontSize: '13px', color: '#64748b', marginTop: 3 }}>
                          Papel: <strong>{selectedUser.role}</strong> · Em uso: <strong>{(selectedUser.usedBytes / (1024 * 1024)).toFixed(1)} MB</strong>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
                      <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: 4 }}>Status de Armazenamento</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: selectedUser.isUnlimited ? '#059669' : '#0f172a' }}>
                          {selectedUser.isUnlimited ? 'Armazenamento Ilimitado' : `Cota Atual: ${selectedUser.quotaMB} MB`}
                        </span>
                      </div>
                      <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: 4 }}>Espaço Ocupado</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                          {(selectedUser.usedBytes / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      </div>
                    </div>

                    {/* Checkbox Ilimitado */}
                    <div style={{ marginBottom: 16 }}>
                      <label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, fontSize: '14px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={userQuotaEdit.unlimited}
                          onChange={(e) =>
                            setUserQuotaEdit({ ...userQuotaEdit, unlimited: e.target.checked })
                          }
                        />
                        Indicar como &quot;Ilimitado&quot; (sem restrição de megas)
                      </label>
                    </div>

                    {/* Especificar Megas */}
                    {!userQuotaEdit.unlimited && (
                      <div style={{ maxWidth: 280, marginBottom: 20 }}>
                        <Field label="Quantidade de megas da conta:">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="number"
                              min={10}
                              max={100000}
                              value={userQuotaEdit.value}
                              onChange={(e) =>
                                setUserQuotaEdit({
                                  ...userQuotaEdit,
                                  value: Math.max(1, Number(e.target.value)),
                                })
                              }
                              style={{ background: '#ffffff', width: '120px' }}
                            />
                            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>MB</span>
                          </div>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: 4, display: 'block' }}>
                            Padrão do sistema: 100 MB
                          </span>
                        </Field>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                      <Button busy={savingQuota} type="button" onClick={handleSaveUserQuota}>
                        Salvar Cota do Usuário
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: '13px', margin: 0 }}>
                    Selecione um usuário acima para ajustar sua cota de armazenamento.
                  </p>
                )}
              </div>

              {/* Table listing all users and their quotas */}
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
                            <div>{u.name}</div>
                            {u.email ? <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 400 }}>{u.email}</div> : null}
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

          {/* Super Admin Users Tab */}
          {tab === 'users' && isSuperAdmin ? (
            <Card style={{ padding: '24px' }}>
              {/* Header & Search */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 20,
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div>
                  <h2
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: '#0f172a',
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Users size={22} color="var(--blue, #2563eb)" />
                    Gestão de Usuários Cadastrados
                  </h2>
                  <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
                    Controle de acessos, status, cota de armazenamento e métricas analíticas de uso.
                  </p>
                </div>

                {/* Search input */}
                <div style={{ position: 'relative', width: '280px' }}>
                  <Search
                    size={16}
                    color="#94a3b8"
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou e-mail..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    style={{
                      paddingLeft: 34,
                      fontSize: '13px',
                      width: '100%',
                      height: '38px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                    }}
                  />
                </div>
              </div>

              {/* Stats Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: 14,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    padding: '14px 18px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, display: 'block' }}>
                    Total de Usuários
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>
                    {adminUsers.length}
                  </span>
                </div>
                <div
                  style={{
                    padding: '14px 18px',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#047857', fontWeight: 500, display: 'block' }}>
                    Usuários Ativos
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 700, color: '#065f46' }}>
                    {adminUsers.filter((u) => u.status === 'active').length}
                  </span>
                </div>
                <div
                  style={{
                    padding: '14px 18px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 500, display: 'block' }}>
                    Total de Gerações
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 700, color: '#1e40af' }}>
                    {adminUsers.reduce((acc, u) => acc + (u.total_generations || 0), 0)}
                  </span>
                </div>
                <div
                  style={{
                    padding: '14px 18px',
                    background: '#faf5ff',
                    border: '1px solid #e9d5ff',
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#7e22ce', fontWeight: 500, display: 'block' }}>
                    Saldo Consumido
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 700, color: '#6b21a8' }}>
                    {adminUsers.reduce((acc, u) => acc + (u.saldo_consumido || 0), 0)}{' '}
                    <span style={{ fontSize: '13px', fontWeight: 500 }}>Conteúdos</span>
                  </span>
                </div>
              </div>

              {/* Notification */}
              {usersNotice && (
                <div style={{ marginBottom: 18 }}>
                  <Notice message={usersNotice.message} error={usersNotice.error} />
                </div>
              )}

              {/* Table of Registered Users */}
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    textAlign: 'left',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#475569',
                      }}
                    >
                      <th style={{ padding: '12px 14px', fontWeight: 600 }}>Usuário / Cadastro</th>
                      <th style={{ padding: '12px 14px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px 14px', fontWeight: 600 }}>Uso & Saldo</th>
                      <th style={{ padding: '12px 14px', fontWeight: 600 }}>Qualidades Usadas</th>
                      <th style={{ padding: '12px 14px', fontWeight: 600 }}>Armazenamento</th>
                      <th style={{ padding: '12px 14px', fontWeight: 600, textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const isSuper = u.email.toLowerCase() === 'r.barros84@gmail.com';
                      const initials = (u.name || u.email || 'U')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part) => part[0]?.toUpperCase())
                        .join('');

                      const storageUsedMB = (u.storage_used_bytes / (1024 * 1024)).toFixed(1);
                      const isBusyStatus = userStatusBusyId === u.id;
                      const isBusyReset = userResetBusyId === u.id;

                      const statusColors: Record<UserStatus, { bg: string; text: string; border: string; label: string }> = {
                        active: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0', label: 'Ativo' },
                        inactive: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', label: 'Inativo' },
                        blocked: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca', label: 'Bloqueado' },
                      };
                      const statusStyle = statusColors[u.status] || statusColors.active;

                      return (
                        <tr
                          key={u.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            transition: 'background 0.15s ease',
                          }}
                        >
                          {/* User / Cadastral info */}
                          <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              {u.avatar_url ? (
                                <img
                                  src={u.avatar_url}
                                  alt={u.name}
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '1px solid #e2e8f0',
                                    flexShrink: 0,
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: '50%',
                                    background: isSuper ? '#dbeafe' : '#f1f5f9',
                                    color: isSuper ? '#1d4ed8' : '#475569',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    flexShrink: 0,
                                  }}
                                >
                                  {initials}
                                </div>
                              )}
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{u.name}</span>
                                  {isSuper ? (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        padding: '1px 6px',
                                        borderRadius: 10,
                                        background: '#dbeafe',
                                        color: '#1e40af',
                                      }}
                                    >
                                      Super Admin
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        padding: '1px 6px',
                                        borderRadius: 10,
                                        background: '#f1f5f9',
                                        color: '#64748b',
                                      }}
                                    >
                                      {u.role}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b' }}>{u.email}</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 3 }}>
                                  Cadastro: {new Date(u.created_at).toLocaleDateString(locale)} ·{' '}
                                  Acesso:{' '}
                                  {u.last_sign_in_at
                                    ? new Date(u.last_sign_in_at).toLocaleDateString(locale, {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : 'Nunca acessou'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '3px 9px',
                                borderRadius: 12,
                                fontSize: '12px',
                                fontWeight: 600,
                                background: statusStyle.bg,
                                color: statusStyle.text,
                                border: `1px solid ${statusStyle.border}`,
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: statusStyle.text,
                                }}
                              />
                              {statusStyle.label}
                            </span>
                          </td>

                          {/* Usage & Consumption */}
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontWeight: 700,
                                color: '#b45309',
                                fontSize: '13px',
                              }}
                            >
                              <span>🪙</span>
                              <span>{u.content_quota_balance ?? 0} cotas</span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: 3 }}>
                              Atribuído:{' '}
                              <strong style={{ color: '#0f172a' }}>
                                {u.content_quota_total_assigned ?? 0}
                              </strong>{' '}
                              · Consumido:{' '}
                              <strong style={{ color: '#7e22ce' }}>
                                {u.content_quota_total_consumed ?? u.saldo_consumido ?? 0}
                              </strong>
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>
                              {u.total_generations} gerações no total
                            </div>
                          </td>

                          {/* Qualities breakdown */}
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ fontSize: '11px', color: '#475569' }}>
                                <span style={{ fontWeight: 600, color: '#0284c7' }}>Padrão:</span>{' '}
                                {u.qualities_used.low || 0}
                              </div>
                              <div style={{ fontSize: '11px', color: '#475569' }}>
                                <span style={{ fontWeight: 600, color: '#d97706' }}>Premium:</span>{' '}
                                {u.qualities_used.medium || 0}
                              </div>
                              {u.qualities_used.high > 0 && (
                                <div style={{ fontSize: '11px', color: '#475569' }}>
                                  <span style={{ fontWeight: 600, color: '#dc2626' }}>Alta:</span>{' '}
                                  {u.qualities_used.high}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Storage */}
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              {storageUsedMB} MB
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: 2 }}>
                              Limite:{' '}
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: u.is_unlimited ? '#059669' : '#2563eb',
                                }}
                              >
                                {u.is_unlimited ? 'Ilimitado' : `${u.storage_quota_mb} MB`}
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '12px 14px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <div
                              style={{
                                display: 'inline-flex',
                                gap: 6,
                                alignItems: 'center',
                                justifyContent: 'flex-end',
                                flexWrap: 'wrap',
                              }}
                            >
                              {/* Status Action */}
                              {!isSuper && (
                                <>
                                  {u.status === 'active' ? (
                                    <>
                                      <Button
                                        secondary
                                        type="button"
                                        busy={isBusyStatus}
                                        onClick={() => handleUpdateStatus(u.id, 'inactive')}
                                        style={{ padding: '4px 8px', fontSize: '11px' }}
                                        title="Inativar usuário"
                                      >
                                        Inativar
                                      </Button>
                                      <Button
                                        secondary
                                        type="button"
                                        busy={isBusyStatus}
                                        onClick={() => handleUpdateStatus(u.id, 'blocked')}
                                        style={{
                                          padding: '4px 8px',
                                          fontSize: '11px',
                                          color: '#dc2626',
                                        }}
                                        title="Bloquear acesso do usuário"
                                      >
                                        Bloquear
                                      </Button>
                                    </>
                                  ) : u.status === 'inactive' ? (
                                    <>
                                      <Button
                                        secondary
                                        type="button"
                                        busy={isBusyStatus}
                                        onClick={() => handleUpdateStatus(u.id, 'active')}
                                        style={{
                                          padding: '4px 8px',
                                          fontSize: '11px',
                                          color: '#059669',
                                        }}
                                        title="Ativar usuário"
                                      >
                                        Ativar
                                      </Button>
                                      <Button
                                        secondary
                                        type="button"
                                        busy={isBusyStatus}
                                        onClick={() => handleUpdateStatus(u.id, 'blocked')}
                                        style={{
                                          padding: '4px 8px',
                                          fontSize: '11px',
                                          color: '#dc2626',
                                        }}
                                        title="Bloquear usuário"
                                      >
                                        Bloquear
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      secondary
                                      type="button"
                                      busy={isBusyStatus}
                                      onClick={() => handleUpdateStatus(u.id, 'active')}
                                      style={{
                                        padding: '4px 8px',
                                        fontSize: '11px',
                                        color: '#059669',
                                      }}
                                      title="Desbloquear e ativar usuário"
                                    >
                                      Desbloquear
                                    </Button>
                                  )}
                                </>
                              )}

                              {/* Password Reset */}
                              <Button
                                secondary
                                type="button"
                                busy={isBusyReset}
                                onClick={() => handleResetPassword(u.id, u.email)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                title="Enviar e-mail para redefinição de senha"
                              >
                                <KeyRound size={12} style={{ marginRight: 3 }} />
                                Redefinir Senha
                              </Button>

                              {/* Adjust Storage Limit */}
                              <Button
                                secondary
                                type="button"
                                onClick={() => handleOpenQuotaModal(u)}
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                title="Ajustar limite de armazenamento e ver histórico"
                              >
                                <HardDrive size={12} style={{ marginRight: 3 }} />
                                Ajustar Limite
                              </Button>

                              {/* Atribuir Cotas de Conteúdo */}
                              <Button
                                secondary
                                type="button"
                                onClick={() => handleOpenContentQuotaModal(u)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  color: '#b45309',
                                  borderColor: '#fde68a',
                                  background: '#fffbeb',
                                }}
                                title="Atribuir cotas de conteúdo e ver histórico de movimentações"
                              >
                                <Coins size={12} style={{ marginRight: 3 }} />
                                Atribuir Cotas
                              </Button>

                              {/* Delete (Never for Super Admin) */}
                              {!isSuper && (
                                <Button
                                  secondary
                                  type="button"
                                  onClick={() => setSelectedUserForDelete(u)}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    color: '#dc2626',
                                    borderColor: '#fecaca',
                                    background: '#fff5f5',
                                  }}
                                  title="Excluir usuário do sistema"
                                >
                                  <Trash2 size={12} style={{ marginRight: 3 }} />
                                  Excluir
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredUsers.length === 0 && (
                  <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    Nenhum usuário encontrado com o termo informado.
                  </div>
                )}
              </div>
            </Card>
          ) : null}

          <Notice {...action} />
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {selectedUserForDelete && (
        <Modal
          title="Confirmar Exclusão de Usuário"
          icon={<Trash2 size={24} color="#ef4444" />}
          onClose={() => !deletingUser && setSelectedUserForDelete(null)}
        >
          <div style={{ padding: '4px 0 16px' }}>
            <div
              style={{
                padding: '12px 16px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                marginBottom: 16,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: '#991b1b', lineHeight: 1.4 }}>
                <strong>Atenção:</strong> Esta ação é permanente e irreversível. O usuário perderá o acesso à plataforma e todos os vínculos cadastrais serão removidos.
              </span>
            </div>
            <p style={{ fontSize: '14px', color: '#334155', margin: '0 0 8px' }}>
              Você está prestes a excluir o seguinte usuário:
            </p>
            <div
              style={{
                padding: '10px 14px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                marginBottom: 20,
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px' }}>
                {selectedUserForDelete.name}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                {selectedUserForDelete.email || 'Sem e-mail'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button
                secondary
                disabled={deletingUser}
                type="button"
                onClick={() => setSelectedUserForDelete(null)}
              >
                Cancelar
              </Button>
              <Button
                busy={deletingUser}
                type="button"
                onClick={handleConfirmDelete}
                style={{ background: '#dc2626', borderColor: '#dc2626', color: '#ffffff' }}
              >
                Confirmar Exclusão
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Quota Adjustment & History Modal */}
      {selectedUserForQuota && (
        <Modal
          title="Ajustar Limite de Cota (MB)"
          subtitle={`Usuário: ${selectedUserForQuota.name} (${selectedUserForQuota.email || 'Sem e-mail'})`}
          icon={<HardDrive size={24} color="#2563eb" />}
          onClose={() => !savingQuotaModal && setSelectedUserForQuota(null)}
        >
          <div style={{ padding: '4px 0 10px', minWidth: '420px', maxWidth: '100%' }}>
            {/* Current Quota Status */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
                padding: '12px 14px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>
                  Espaço em Uso
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>
                  {(selectedUserForQuota.storage_used_bytes / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>
                  Cota Atual
                </span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#2563eb' }}>
                  {selectedUserForQuota.is_unlimited
                    ? 'Ilimitado'
                    : `${selectedUserForQuota.storage_quota_mb} MB`}
                </span>
              </div>
            </div>

            {/* Checkbox Unlimited */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={quotaModalUnlimited}
                  onChange={(e) => setQuotaModalUnlimited(e.target.checked)}
                />
                Indicar como &quot;Ilimitado&quot; (sem restrição de megas)
              </label>
            </div>

            {/* Specify MB */}
            {!quotaModalUnlimited && (
              <div style={{ marginBottom: 16 }}>
                <Field label="Quantidade de megas da conta:">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      min={10}
                      max={100000}
                      value={quotaModalValue}
                      onChange={(e) => setQuotaModalValue(Math.max(1, Number(e.target.value)))}
                      style={{ background: '#ffffff', width: '130px' }}
                    />
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>MB</span>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#94a3b8',
                      marginTop: 4,
                      display: 'block',
                    }}
                  >
                    Padrão do sistema: 100 MB
                  </span>
                </Field>
              </div>
            )}

            {/* Reason for adjustment */}
            <div style={{ marginBottom: 20 }}>
              <Field label="Motivo do ajuste (opcional):">
                <input
                  type="text"
                  placeholder="Ex: Upgrade de plano, bônus promocional, solicitação direta..."
                  value={quotaModalReason}
                  onChange={(e) => setQuotaModalReason(e.target.value)}
                  style={{ background: '#ffffff', width: '100%' }}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 24 }}>
              <Button
                secondary
                type="button"
                disabled={savingQuotaModal}
                onClick={() => setSelectedUserForQuota(null)}
              >
                Cancelar
              </Button>
              <Button busy={savingQuotaModal} type="button" onClick={handleSaveQuotaModal}>
                Salvar Ajuste
              </Button>
            </div>

            {/* History of adjustments */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <h4
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  margin: '0 0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <History size={15} color="#64748b" />
                Histórico de Ajustes Registrados
              </h4>
              {selectedUserForQuota.adjustment_history &&
              selectedUserForQuota.adjustment_history.length > 0 ? (
                <div
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      textAlign: 'left',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0',
                          color: '#64748b',
                        }}
                      >
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Data</th>
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Cota</th>
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Administrador</th>
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUserForQuota.adjustment_history.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {new Date(log.created_at).toLocaleDateString(locale, {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 600, color: '#0f172a' }}>
                            {log.new_quota_mb === -1 ? 'Ilimitado' : `${log.new_quota_mb} MB`}
                          </td>
                          <td style={{ padding: '6px 10px', color: '#475569' }}>
                            {log.admin_email || 'Super Admin'}
                          </td>
                          <td
                            style={{
                              padding: '6px 10px',
                              color: '#64748b',
                              fontStyle: log.reason ? 'normal' : 'italic',
                            }}
                          >
                            {log.reason || 'Sem motivo informado'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, fontStyle: 'italic' }}>
                  Nenhum ajuste registrado anteriormente para este usuário.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Content Quota Assignment Modal */}
      {selectedUserForContentQuota && (
        <Modal
          title="Atribuir Cotas de Conteúdo"
          subtitle={`Usuário: ${selectedUserForContentQuota.name} (${selectedUserForContentQuota.email || 'Sem e-mail'})`}
          icon={<Coins size={24} color="#d97706" />}
          onClose={() => !savingContentQuota && setSelectedUserForContentQuota(null)}
        >
          <div style={{ padding: '4px 0 10px', minWidth: '460px', maxWidth: '100%' }}>
            {/* Current Quota Status Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                marginBottom: 16,
                padding: '12px 14px',
                background: '#fffbeb',
                borderRadius: 8,
                border: '1px solid #fde68a',
              }}
            >
              <div>
                <span
                  style={{ fontSize: '11px', color: '#92400e', display: 'block', fontWeight: 500 }}
                >
                  Saldo Atual
                </span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#b45309' }}>
                  🪙 {selectedUserForContentQuota.content_quota_balance ?? 0}
                </span>
              </div>
              <div>
                <span
                  style={{ fontSize: '11px', color: '#92400e', display: 'block', fontWeight: 500 }}
                >
                  Total Atribuído
                </span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  {selectedUserForContentQuota.content_quota_total_assigned ?? 0}
                </span>
              </div>
              <div>
                <span
                  style={{ fontSize: '11px', color: '#92400e', display: 'block', fontWeight: 500 }}
                >
                  Total Consumido
                </span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#7e22ce' }}>
                  {selectedUserForContentQuota.content_quota_total_consumed ??
                    selectedUserForContentQuota.saldo_consumido ??
                    0}
                </span>
              </div>
            </div>

            {/* Mode selection: Add vs Set */}
            <div style={{ marginBottom: 14 }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#334155',
                  display: 'block',
                  marginBottom: 6,
                }}
              >
                Tipo de Movimentação:
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setContentQuotaMode('add')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${contentQuotaMode === 'add' ? '#d97706' : '#cbd5e1'}`,
                    background: contentQuotaMode === 'add' ? '#fef3c7' : '#ffffff',
                    color: contentQuotaMode === 'add' ? '#92400e' : '#475569',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  + Adicionar ao Saldo (Crédito)
                </button>
                <button
                  type="button"
                  onClick={() => setContentQuotaMode('set')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: `1px solid ${contentQuotaMode === 'set' ? '#2563eb' : '#cbd5e1'}`,
                    background: contentQuotaMode === 'set' ? '#eff6ff' : '#ffffff',
                    color: contentQuotaMode === 'set' ? '#1e40af' : '#475569',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  = Definir Saldo Exato
                </button>
              </div>
            </div>

            {/* Amount and quick chips */}
            <div style={{ marginBottom: 14 }}>
              <Field
                label={
                  contentQuotaMode === 'add'
                    ? 'Quantidade de cotas a adicionar:'
                    : 'Novo saldo exato:'
                }
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={contentQuotaAmount}
                    onChange={(e) => setContentQuotaAmount(Math.max(0, Number(e.target.value)))}
                    style={{
                      background: '#ffffff',
                      width: '140px',
                      fontWeight: 700,
                      fontSize: '14px',
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                    cotas
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontSize: '12px',
                      color: '#059669',
                      fontWeight: 600,
                    }}
                  >
                    Saldo resultante: 🪙{' '}
                    {contentQuotaMode === 'add'
                      ? (selectedUserForContentQuota.content_quota_balance ?? 0) +
                        Number(contentQuotaAmount)
                      : Number(contentQuotaAmount)}{' '}
                    cotas
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[10, 25, 50, 100, 250, 500].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setContentQuotaAmount(val)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 4,
                        fontSize: '11px',
                        fontWeight: 600,
                        border: '1px solid #e2e8f0',
                        background: contentQuotaAmount === val ? '#dbeafe' : '#f8fafc',
                        color: contentQuotaAmount === val ? '#1d4ed8' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      +{val}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Reason */}
            <div style={{ marginBottom: 20 }}>
              <Field label="Motivo do ajuste administrativo (opcional):">
                <input
                  type="text"
                  placeholder="Ex: Bônus de contratação, recarga avulsa, suporte a campanhas..."
                  value={contentQuotaReason}
                  onChange={(e) => setContentQuotaReason(e.target.value)}
                  style={{ background: '#ffffff', width: '100%' }}
                />
              </Field>
            </div>

            {/* Buttons */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                marginBottom: 20,
              }}
            >
              <Button
                secondary
                type="button"
                disabled={savingContentQuota}
                onClick={() => setSelectedUserForContentQuota(null)}
              >
                Cancelar
              </Button>
              <Button
                busy={savingContentQuota}
                type="button"
                onClick={handleSaveContentQuota}
                style={{ background: '#b45309', borderColor: '#b45309', color: '#ffffff' }}
              >
                Confirmar Atribuição
              </Button>
            </div>

            {/* Ledger History */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
              <h4
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#334155',
                  margin: '0 0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <History size={15} color="#64748b" />
                Histórico de Movimentações de Cotas
              </h4>
              {selectedUserForContentQuota.quota_transactions &&
              selectedUserForContentQuota.quota_transactions.length > 0 ? (
                <div
                  style={{
                    maxHeight: '180px',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                  }}
                >
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      textAlign: 'left',
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0',
                          color: '#64748b',
                        }}
                      >
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Data / Hora</th>
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Tipo</th>
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Qtd</th>
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Saldo Resultante</th>
                        <th style={{ padding: '6px 10px', fontWeight: 600 }}>Origem / Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedUserForContentQuota.quota_transactions.map((tx) => {
                        const isCredit =
                          tx.type === 'ASSIGNMENT' ||
                          tx.type === 'REFUND' ||
                          tx.type === 'ADJUSTMENT';
                        const isDebit = tx.type === 'CONSUMPTION';
                        return (
                          <tr key={tx.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td
                              style={{
                                padding: '6px 10px',
                                color: '#64748b',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {new Date(tx.created_at).toLocaleDateString(locale, {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <span
                                style={{
                                  padding: '1px 6px',
                                  borderRadius: 4,
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  background: isCredit
                                    ? '#ecfdf5'
                                    : isDebit
                                      ? '#fef2f2'
                                      : '#eff6ff',
                                  color: isCredit ? '#047857' : isDebit ? '#b91c1c' : '#1d4ed8',
                                }}
                              >
                                {isCredit ? 'CRÉDITO' : isDebit ? 'DÉBITO' : 'AJUSTE'}
                              </span>
                            </td>
                            <td
                              style={{
                                padding: '6px 10px',
                                fontWeight: 700,
                                color: isCredit ? '#047857' : isDebit ? '#b91c1c' : '#0f172a',
                              }}
                            >
                              {isCredit ? `+${tx.amount}` : isDebit ? `-${tx.amount}` : `${tx.amount}`}
                            </td>
                            <td
                              style={{ padding: '6px 10px', fontWeight: 600, color: '#b45309' }}
                            >
                              🪙 {tx.balance_after}
                            </td>
                            <td
                              style={{
                                padding: '6px 10px',
                                color: '#64748b',
                                fontStyle: tx.description ? 'normal' : 'italic',
                              }}
                            >
                              {tx.description || tx.reason || tx.source || 'Movimentação do sistema'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    margin: 0,
                    fontStyle: 'italic',
                  }}
                >
                  Nenhuma movimentação de cotas registrada ainda.
                </p>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
