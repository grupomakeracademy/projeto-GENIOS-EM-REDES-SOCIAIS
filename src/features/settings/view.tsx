'use client';
import { useState } from 'react';
import { BrainCircuit, Bot, FileText, Image, Database, Camera, Trash2 } from 'lucide-react';
import { Button, Card, Field, Notice, useT, useLocale, useAction, api } from '@/components/ui';
import type { AIConfig, ProviderId } from '@/lib/domain';
import { ModelPicker } from './model-picker';
import { CredentialPanel, type CredentialStatus } from './credential-panel';
export function SettingsView({
  configs,
  credentials,
  profile,
  company,
  canAdmin,
}: {
  configs: AIConfig[];
  credentials: CredentialStatus | null;
  profile: { name: string; email: string; avatarUrl?: string };
  company: { name: string; timezone: string };
  canAdmin: boolean;
}) {
  const t = useT(),
    locale = useLocale(),
    action = useAction(),
    [tab, setTab] = useState('ai'),
    [models, setModels] = useState<AIConfig[]>(configs),
    [avatar, setAvatar] = useState(profile.avatarUrl || ''),
    [avatarBusy, setAvatarBusy] = useState(false);
  const sections = ['profile', 'security', 'ai', 'credentials', 'company', 'preferences'];
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
          <Notice {...action} />
        </div>
      </div>
    </>
  );
}
