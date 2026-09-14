'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AgentModels } from './models';
import { Bot, Plus, Play, List, LayoutGrid, Check, MessageCircle, Clock, ChevronDown } from 'lucide-react';
import { SocialLogo } from '@/components/social-logos';
import './agents.css';
import { Button, Card, Field, Notice, Empty, useT, useAction, api } from '@/components/ui';
import { channels, type Agent, type Asset, type Channel } from '@/lib/domain';
import { useLocale } from '@/components/ui';
const briefingFields: Record<string, [string, string, string]> = {
  company: ['Empresa', 'Company', 'Empresa'],
  description: ['Descrição da empresa', 'Company description', 'Descripción de la empresa'],
  segment: ['Segmento', 'Industry', 'Sector'],
  product: ['Produto principal', 'Main product', 'Producto principal'],
  services: ['Serviços', 'Services', 'Servicios'],
  how_it_works: ['Como funciona', 'How it works', 'Cómo funciona'],
  audience: ['Público-alvo', 'Target audience', 'Público objetivo'],
  persona: ['Persona', 'Persona', 'Persona'],
  age: ['Idade aproximada', 'Approximate age', 'Edad aproximada'],
  economic_profile: ['Perfil econômico', 'Economic profile', 'Perfil económico'],
  pains: ['Dores', 'Pain points', 'Problemas'],
  desires: ['Desejos', 'Desires', 'Deseos'],
  objections: ['Objeções', 'Objections', 'Objeciones'],
  benefits: ['Benefícios', 'Benefits', 'Beneficios'],
  differentiators: ['Diferenciais', 'Differentiators', 'Diferenciadores'],
  competitors: ['Concorrentes', 'Competitors', 'Competidores'],
  positioning: ['Posicionamento', 'Positioning', 'Posicionamiento'],
  value_proposition: ['Proposta de valor', 'Value proposition', 'Propuesta de valor'],
  goals: ['Objetivos nas redes', 'Social goals', 'Objetivos en redes'],
  commercial_goal: ['Objetivo comercial', 'Commercial goal', 'Objetivo comercial'],
  cta: ['CTA principal', 'Primary CTA', 'CTA principal'],
  secondary_ctas: ['CTAs secundários', 'Secondary CTAs', 'CTAs secundarios'],
  site: ['Site', 'Website', 'Sitio web'],
  whatsapp: ['WhatsApp', 'WhatsApp', 'WhatsApp'],
  instagram: ['Instagram', 'Instagram', 'Instagram'],
  facebook: ['Facebook', 'Facebook', 'Facebook'],
  tiktok: ['TikTok', 'TikTok', 'TikTok'],
  x: ['X', 'X', 'X'],
  linkedin: ['LinkedIn', 'LinkedIn', 'LinkedIn'],
  address: ['Endereço', 'Address', 'Dirección'],
  phone: ['Telefone', 'Phone', 'Teléfono'],
  email: ['E-mail', 'Email', 'Correo'],
  allowed_information: ['Informações permitidas', 'Allowed information', 'Información permitida'],
  forbidden_information: [
    'Informações proibidas',
    'Forbidden information',
    'Información prohibida',
  ],
  preferred_terms: ['Termos preferidos', 'Preferred terms', 'Términos preferidos'],
  forbidden_terms: [
    'Termos proibidos (um por linha)',
    'Forbidden terms (one per line)',
    'Términos prohibidos (uno por línea)',
  ],
  notes: ['Observações', 'Notes', 'Notas'],
};
const textFields: Record<string, [string, string, string]> = {
  instructions: ['Instruções de escrita', 'Writing instructions', 'Instrucciones de escritura'],
  tone: ['Tom da comunicação', 'Tone of voice', 'Tono de comunicación'],
  formality: ['Formalidade', 'Formality', 'Formalidad'],
  technicality: ['Nível de tecnicidade', 'Technical level', 'Nivel técnico'],
  emojis: ['Uso de emojis', 'Emoji use', 'Uso de emojis'],
  length: ['Tamanho preferido', 'Preferred length', 'Longitud preferida'],
  structure: ['Estrutura', 'Structure', 'Estructura'],
  preferred_terms: briefingFields.preferred_terms,
  forbidden_terms: briefingFields.forbidden_terms,
  examples: ['Exemplos reais de posts', 'Real post examples', 'Ejemplos reales de publicaciones'],
  ctas: ['CTAs', 'CTAs', 'CTAs'],
};
const WEEKDAY_OPTIONS = [
  { value: 1, label: '1 (Segunda-Feira)' },
  { value: 2, label: '2 (Terça-Feira)' },
  { value: 3, label: '3 (Quarta-Feira)' },
  { value: 4, label: '4 (Quinta-Feira)' },
  { value: 5, label: '5 (Sexta-Feira)' },
  { value: 6, label: '6 (Sábado)' },
  { value: 7, label: '7 (Domingo)' },
];

function WeekdaySelector({
  value = [],
  onChange,
  disabled,
}: {
  value: number[];
  onChange: (weekdays: number[]) => void;
  disabled?: boolean;
}) {
  const currentDays = Array.isArray(value) ? value : [];

  const toggleDay = (day: number) => {
    if (disabled) return;
    if (currentDays.includes(day)) {
      onChange(currentDays.filter((d) => d !== day).sort((a, b) => a - b));
    } else {
      onChange([...currentDays, day].sort((a, b) => a - b));
    }
  };

  const isSegASex =
    currentDays.length === 5 && [1, 2, 3, 4, 5].every((d) => currentDays.includes(d));
  const isTodos =
    currentDays.length === 7 && [1, 2, 3, 4, 5, 6, 7].every((d) => currentDays.includes(d));

  return (
    <div className="agent-weekday-horizontal-container">
      <div className="agent-weekday-actions-bar">
        <button
          type="button"
          disabled={disabled}
          className={`quick-action-btn ${isSegASex ? 'active-preset' : ''}`}
          onClick={() => onChange([1, 2, 3, 4, 5])}
        >
          Seg a Sex (1 a 5)
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`quick-action-btn ${isTodos ? 'active-preset' : ''}`}
          onClick={() => onChange([1, 2, 3, 4, 5, 6, 7])}
        >
          Todos (1 a 7)
        </button>
        <button
          type="button"
          disabled={disabled}
          className="quick-action-btn clear"
          onClick={() => onChange([])}
        >
          Limpar
        </button>
      </div>

      <div className="agent-weekday-horizontal">
        {WEEKDAY_OPTIONS.map((opt) => {
          const isSelected = currentDays.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`agent-weekday-chip ${isSelected ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={isSelected}
                onChange={() => toggleDay(opt.value)}
              />
              <span className="weekday-text">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ModernTimePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (time: string) => void;
  disabled?: boolean;
}) {
  const [hourStr, minStr] = (value && value.includes(':') ? value.split(':') : ['08', '00']);
  const currentHour = (hourStr || '08').padStart(2, '0');
  const currentMin = (minStr || '00').padStart(2, '0');

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const presets = ['08:00', '11:30', '14:00', '18:00', '20:30', '23:30'];

  const handleHourChange = (newHour: string) => {
    if (disabled) return;
    onChange(`${newHour}:${currentMin}`);
  };

  const handleMinChange = (newMin: string) => {
    if (disabled) return;
    onChange(`${currentHour}:${newMin}`);
  };

  return (
    <div className="agent-modern-time-picker">
      <div className="agent-time-inputs">
        <div className="agent-time-unit">
          <span className="unit-label">Hora</span>
          <select
            disabled={disabled}
            value={currentHour}
            onChange={(e) => handleHourChange(e.target.value)}
            className="time-select"
          >
            {hours.map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
        <span className="time-colon">:</span>
        <div className="agent-time-unit">
          <span className="unit-label">Minuto</span>
          <select
            disabled={disabled}
            value={currentMin}
            onChange={(e) => handleMinChange(e.target.value)}
            className="time-select"
          >
            {minutes.map((m) => (
              <option key={m} value={m}>
                {m}m
              </option>
            ))}
          </select>
        </div>
        <div className="agent-time-display">
          <Clock size={16} />
          <span>{currentHour}:{currentMin}</span>
        </div>
      </div>
      <div className="agent-time-presets">
        <span className="presets-label">Sugestões:</span>
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            className={`preset-pill ${value === preset ? 'active' : ''}`}
            onClick={() => onChange(preset)}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AgentEditor({
  agents,
  assets,
  memories,
  schedules,
  canEdit,
}: {
  agents: Agent[];
  assets: Asset[];
  memories: Record<string, unknown>[];
  schedules: Record<string, unknown>[];
  canEdit: boolean;
}) {
  const t = useT(),
    locale = useLocale(),
    router = useRouter(),
    params = useSearchParams(),
    action = useAction(),
    [selected, setSelected] = useState<Agent | null>(
      agents.find((a) => a.id === params.get('agent')) || agents[0] || null,
    ),
    [tab, setTab] = useState('briefing'),
    [refView, setRefView] = useState<'list' | 'thumbnails'>('list');
  const [schedule, setSchedule] = useState<Record<string, unknown>>(
    schedules.find((s) => s.agent_id === selected?.id) || {
      enabled: false,
      timezone: 'America/Sao_Paulo',
      local_time: '08:00',
      weekdays: [1, 2, 3, 4, 5],
    },
  );
  function choose(agent: Agent) {
    if (!agent) return;
    router.replace(`/agents?agent=${agent.id}`, { scroll: false });
    setSelected(agent);
    setSchedule(
      schedules.find((s) => s.agent_id === agent.id) || {
        enabled: false,
        timezone: 'America/Sao_Paulo',
        local_time: '08:00',
        weekdays: [1, 2, 3, 4, 5],
      },
    );
  }
  const createAgent = () => router.push('/agents/new');
  function groupFields(group: 'briefing' | 'text_settings', fields: typeof briefingFields) {
    return Object.entries(fields).map(([key, label]) => (
      <Field key={key} label={label[locale === 'en-US' ? 1 : locale === 'es-ES' ? 2 : 0]}>
        <textarea
          disabled={!canEdit}
          value={String(selected?.[group][key] || '')}
          onChange={(e) =>
            setSelected({ ...selected!, [group]: { ...selected![group], [key]: e.target.value } })
          }
        />
      </Field>
    ));
  }
  return (
    <>
      <div className="page-heading">
        <h1>{t('agents')}</h1>
        <p>{t('agentsIntro')}</p>
      </div>
      <div className="toolbar">
        <select
          aria-label={t('agents')}
          value={selected?.id || ''}
          onChange={(e) => choose(agents.find((a) => a.id === e.target.value)!)}
        >
          <option value="" disabled>
            {t('agentName')}
          </option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {canEdit ? (
          <Button secondary onClick={createAgent}>
            <Plus size={17} />
            Novo Agente
          </Button>
        ) : null}
        {selected?.id && canEdit ? (
          <Button
            busy={action.busy}
            onClick={() =>
              action.act(async () => {
                await api('runs', 'POST', {
                  agent_id: selected.id,
                  instruction: '',
                  channels: selected.channels,
                  image_count: selected.image_count,
                  idempotency_key: crypto.randomUUID(),
                });
              }, 'enqueued')
            }
          >
            <Play size={16} />
            {t('run')}
          </Button>
        ) : null}
      </div>
      {!selected ? (
        <Card>
          <Empty title={t('configureGenie')}>
            <Bot size={30} />
          </Empty>
        </Card>
      ) : (
        <>
          <div className="tabs" role="tablist">
            {['briefing', 'text', 'visual', 'channels', 'routine', 'memory', 'IA'].map((s) => (
              <button
                role="tab"
                aria-selected={tab === s}
                className={tab === s ? 'active' : ''}
                key={s}
                onClick={() => setTab(s)}
              >
                {t(s)}
              </button>
            ))}
          </div>
          <Card>
            {tab === 'IA' && <AgentModels key={selected.id} agentId={selected.id} />}
            {tab !== 'IA' && (
              <Field label={t('agentName')}>
                <input
                  disabled={!canEdit}
                  value={selected.name}
                  onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                />
              </Field>
            )}
            {tab === 'briefing' ? (
              <div className="grid two">{groupFields('briefing', briefingFields)}</div>
            ) : null}
            {tab === 'text' ? (
              <>
                <div className="grid two">{groupFields('text_settings', textFields)}</div>
              </>
            ) : null}
            {tab === 'visual' ? (
              <>
                <Field label={t('visual')}>
                  <textarea
                    disabled={!canEdit}
                    value={String(selected.visual_settings.style || '')}
                    onChange={(e) =>
                      setSelected({
                        ...selected,
                        visual_settings: { ...selected.visual_settings, style: e.target.value },
                      })
                    }
                  />
                </Field>
                <div className="section-heading">
                  <h3>{t('references')}</h3>
                  <div className="view-toggle">
                    <button
                      className={refView === 'list' ? 'active' : ''}
                      onClick={() => setRefView('list')}
                      title={t('viewList')}
                    >
                      <List size={14} />
                    </button>
                    <button
                      className={refView === 'thumbnails' ? 'active' : ''}
                      onClick={() => setRefView('thumbnails')}
                      title={t('viewThumbnails')}
                    >
                      <LayoutGrid size={14} />
                    </button>
                  </div>
                </div>
                {refView === 'list' ? (
                  <div className="grid two">
                    {assets
                      .filter((a) => a.mime_type.startsWith('image/'))
                      .map((a) => (
                        <label className="check" key={a.id}>
                          <input
                            type="checkbox"
                            disabled={!canEdit}
                            checked={(
                              (selected.visual_settings.reference_ids || []) as string[]
                            ).includes(a.id)}
                            onChange={(e) => {
                              const ids = (selected.visual_settings.reference_ids ||
                                []) as string[];
                              setSelected({
                                ...selected,
                                visual_settings: {
                                  ...selected.visual_settings,
                                  reference_ids: e.target.checked
                                    ? [...ids, a.id]
                                    : ids.filter((id) => id !== a.id),
                                },
                              });
                            }}
                          />
                          {a.name}
                        </label>
                      ))}
                  </div>
                ) : (
                  <div className="ref-thumb-grid">
                    {assets
                      .filter((a) => a.mime_type.startsWith('image/'))
                      .map((a) => {
                        const isSelected = (
                          (selected.visual_settings.reference_ids || []) as string[]
                        ).includes(a.id);
                        return (
                          <div
                            key={a.id}
                            className={`ref-thumb-card${isSelected ? ' selected' : ''}`}
                            onClick={() => {
                              if (!canEdit) return;
                              const ids = (selected.visual_settings.reference_ids ||
                                []) as string[];
                              setSelected({
                                ...selected,
                                visual_settings: {
                                  ...selected.visual_settings,
                                  reference_ids: isSelected
                                    ? ids.filter((id) => id !== a.id)
                                    : [...ids, a.id],
                                },
                              });
                            }}
                          >
                            <img
                              loading="lazy"
                              src={(a as Asset & { url?: string }).url || ''}
                              alt={a.name}
                            />
                            <span className="ref-check">
                              <Check size={14} />
                            </span>
                            <div className="ref-name">{a.name}</div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            ) : null}
            {tab === 'channels' ? (
              <>
                <div className="agent-channel-guide">
                  <MessageCircle size={22} />
                  <div>
                    <strong>Adapte a comunicação para cada canal</strong>
                    <p>
                      Cada rede social tem uma forma própria de comunicar. Defina como este gênio
                      deve adaptar o conteúdo da sua marca por canal, mantendo a identidade e o
                      posicionamento geral.
                    </p>
                  </div>
                </div>
                <div className="grid two">
                  {Object.entries(channels).map(([key, value]) => (
                    <Card key={key}>
                      <label className="check">
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={selected.channels.includes(key as Channel)}
                          onChange={(e) =>
                            setSelected({
                              ...selected,
                              channels: e.target.checked
                                ? [...selected.channels, key as Channel]
                                : selected.channels.filter((c) => c !== key),
                            })
                          }
                        />
                        <SocialLogo channel={key as Channel} size={24} />
                        {value.name} · {value.ratio}
                      </label>
                      <Field label="Orientações do canal">
                        <textarea
                          disabled={!canEdit}
                          value={String(selected.channel_settings[key] || '')}
                          onChange={(e) =>
                            setSelected({
                              ...selected,
                              channel_settings: {
                                ...selected.channel_settings,
                                [key]: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    </Card>
                  ))}
                </div>
              </>
            ) : null}
            {tab === 'routine' ? (
              <>
                <div className="grid two">
                  <Field label={t('mode')}>
                    <select
                      disabled={!canEdit}
                      value={selected.mode}
                      onChange={(e) =>
                        setSelected({ ...selected, mode: e.target.value as Agent['mode'] })
                      }
                    >
                      {['MANUAL', 'ASSISTED', 'AUTONOMOUS'].map((v) => (
                        <option key={v} value={v}>
                          {t(v)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('contentLanguage')}>
                    <input
                      disabled={!canEdit}
                      value={selected.content_language}
                      onChange={(e) =>
                        setSelected({ ...selected, content_language: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t('imageCount')}>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      disabled={!canEdit}
                      value={selected.image_count}
                      onChange={(e) =>
                        setSelected({ ...selected, image_count: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <div className="form-row">
                  {(['approval_required', 'research_enabled', 'active'] as const).map((key, i) => (
                    <label key={key} className="check">
                      <input
                        disabled={!canEdit}
                        type="checkbox"
                        checked={selected[key]}
                        onChange={(e) => setSelected({ ...selected, [key]: e.target.checked })}
                      />
                      {t(['approvalRequired', 'research', 'enabled'][i])}
                    </label>
                  ))}
                </div>
                <hr />
                <div className="grid two">
                  <Field label={t('timezone')}>
                    <input
                      value={String(schedule.timezone)}
                      onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value })}
                    />
                  </Field>
                  <div className="field">
                    <span>{t('time')}</span>
                    <ModernTimePicker
                      disabled={!canEdit}
                      value={String(schedule.local_time || '08:00')}
                      onChange={(time) => setSchedule({ ...schedule, local_time: time })}
                    />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <span>{t('weekdays')}</span>
                    <WeekdaySelector
                      disabled={!canEdit}
                      value={
                        Array.isArray(schedule.weekdays)
                          ? (schedule.weekdays as (number | string)[])
                              .map(Number)
                              .filter((n) => !isNaN(n) && n >= 1 && n <= 7)
                          : [1, 2, 3, 4, 5]
                      }
                      onChange={(weekdays) => setSchedule({ ...schedule, weekdays })}
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={Boolean(schedule.enabled)}
                        onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
                      />
                      {t('enabled')}
                    </label>
                  </div>
                </div>
              </>
            ) : null}
            {tab === 'memory' ? (
              memories.filter((m) => m.agent_id === selected.id).length ? (
                memories
                  .filter((m) => m.agent_id === selected.id)
                  .map((m) => (
                    <div className="list-row" key={String(m.id)}>
                      <div>
                        <strong>{String(m.topic)}</strong>
                        <p className="muted">{String(m.angle)}</p>
                      </div>
                      <small>{new Date(String(m.created_at)).toLocaleDateString(locale)}</small>
                    </div>
                  ))
              ) : (
                <Empty title={t('noMemory')} />
              )
            ) : null}
            <Notice {...action} />
            {canEdit && tab !== 'memory' && tab !== 'IA' ? (
              <div className="agent-save-actions">
                <Button
                  busy={action.busy}
                  onClick={() =>
                    action.act(async () => {
                      const saved = await api('agents', 'POST', {
                        ...selected,
                        text_settings: Object.fromEntries(
                          Object.entries(selected.text_settings).filter(
                            ([key]) => key !== 'ai_configs',
                          ),
                        ),
                        id: selected.id || undefined,
                      });
                      if (tab === 'routine') {
                        const parsedWeekdays = Array.isArray(schedule.weekdays)
                          ? (schedule.weekdays as (number | string)[])
                              .map(Number)
                              .filter((n) => !isNaN(n) && n >= 1 && n <= 7)
                          : [1, 2, 3, 4, 5];
                        await api('agents', 'POST', {
                          action: 'schedule',
                          id: saved.id,
                          agent_id: saved.id,
                          timezone: String(schedule.timezone || 'America/Sao_Paulo'),
                          local_time: String(schedule.local_time || '08:00'),
                          weekdays: parsedWeekdays.length ? parsedWeekdays : [1, 2, 3, 4, 5],
                          enabled: Boolean(schedule.enabled),
                        });
                        setSchedule((prev) => ({
                          ...prev,
                          agent_id: saved.id,
                          timezone: schedule.timezone,
                          local_time: schedule.local_time,
                          weekdays: parsedWeekdays.length ? parsedWeekdays : [1, 2, 3, 4, 5],
                          enabled: Boolean(schedule.enabled),
                        }));
                      }
                      setSelected(saved);
                      router.refresh();
                    })
                  }
                >
                  {t('save')}
                </Button>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </>
  );
}
