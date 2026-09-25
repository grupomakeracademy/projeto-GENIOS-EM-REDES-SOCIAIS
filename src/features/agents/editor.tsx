'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AgentModels } from './models';
import {
  Bot,
  Plus,
  Play,
  List,
  LayoutGrid,
  Check,
  MessageCircle,
  Clock,
  ChevronDown,
  Sparkles,
  Palette,
  FileText,
  Layers,
  MousePointerClick,
  Minus,
  X,
  Send,
} from 'lucide-react';
import { SocialLogo } from '@/components/social-logos';
import './agents.css';
import '../content/content.css';
import { Button, Card, Field, Notice, Empty, useT, useAction, api } from '@/components/ui';
import {
  channels,
  type Agent,
  type Asset,
  type Channel,
  type Destination,
  destinations,
  getChannelsDestinations,
} from '@/lib/domain';
import { useLocale } from '@/components/ui';

const ALL_ROUTINE_CHANNELS: Channel[] = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'x', 'linkedin'];
const ROUTINE_IMAGE_STYLES = [
  'Disney / Pixar',
  '3D Cartoon Moderno',
  'Fotorealista / Ultra-realista',
  'Minimalista / Editorial',
  'Ilustração Digital / Vetorial',
  'Cyberpunk / Futurista',
  'Anime / Mangá Japonês',
  'Vintage / Retrô Clássico',
  'Pintura a Óleo / Belas Artes',
  'Flat Design Corporativo',
];
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

  // Routine Card 3 states (Conteúdo do Agente)
  const initialRs = ((selected?.routine_settings as Record<string, unknown>) || {});
  const [routineStyle, setRoutineStyle] = useState<string>(
    (initialRs.image_style as string) || 'Disney / Pixar',
  );
  const [routineInstruction, setRoutineInstruction] = useState<string>(
    (initialRs.instruction as string) || '',
  );
  const [routineChannels, setRoutineChannels] = useState<Channel[]>(
    Array.isArray(initialRs.channels) && initialRs.channels.length
      ? (initialRs.channels as Channel[])
      : (selected?.channels?.length ? selected.channels : ['instagram']),
  );
  const [routineQuality, setRoutineQuality] = useState<'low' | 'medium'>(
    (initialRs.image_quality as 'low' | 'medium') || 'low',
  );
  const [routineCount, setRoutineCount] = useState<number>(
    typeof initialRs.image_count === 'number'
      ? initialRs.image_count
      : (selected && selected.image_count > 0 ? Math.min(6, selected.image_count) : 1),
  );
  const [routineIsCarousel, setRoutineIsCarousel] = useState<boolean>(
    Boolean(initialRs.is_carousel) && Number(initialRs.image_count) > 1,
  );
  const [routineCta, setRoutineCta] = useState<string>(
    (initialRs.cta as string) || '',
  );
  const [routineDestination, setRoutineDestination] = useState<Destination>(
    (initialRs.destination as Destination) || 'feed',
  );

  // Dynamic destinations based on selected channels
  const supportedRoutineDestinations = getChannelsDestinations(routineChannels);
  useEffect(() => {
    if (!supportedRoutineDestinations.includes(routineDestination)) {
      setRoutineDestination('feed');
    }
  }, [supportedRoutineDestinations, routineDestination]);

  // Prompt Mágico state for Card 3
  const [routinePautaBusy, setRoutinePautaBusy] = useState(false);
  const [routinePautaMagicUsed, setRoutinePautaMagicUsed] = useState(false);
  const [routineCtaBusy, setRoutineCtaBusy] = useState(false);
  const [routineCtaMagicUsed, setRoutineCtaMagicUsed] = useState(false);
  const [routineMagicError, setRoutineMagicError] = useState('');

  // Sync routine states when selected agent changes
  useEffect(() => {
    if (!selected) return;
    const rs = ((selected.routine_settings as Record<string, unknown>) || {});
    setRoutineStyle((rs.image_style as string) || 'Disney / Pixar');
    setRoutineInstruction((rs.instruction as string) || '');
    setRoutineChannels(
      Array.isArray(rs.channels) && rs.channels.length
        ? (rs.channels as Channel[])
        : (selected.channels?.length ? selected.channels : ['instagram']),
    );
    setRoutineQuality((rs.image_quality as 'low' | 'medium') || 'low');
    setRoutineCount(
      typeof rs.image_count === 'number'
        ? rs.image_count
        : (selected.image_count > 0 ? Math.min(6, selected.image_count) : 1),
    );
    setRoutineIsCarousel(Boolean(rs.is_carousel) && Number(rs.image_count) > 1);
    setRoutineCta((rs.cta as string) || '');
    setRoutineDestination((rs.destination as Destination) || 'feed');
    setRoutinePautaMagicUsed(false);
    setRoutineCtaMagicUsed(false);
    setRoutineMagicError('');
  }, [selected?.id]);

  // Keep selected agent in sync when agents prop updates (e.g. after library association)
  useEffect(() => {
    if (!agents.length) return;
    setSelected((prev) => {
      if (!prev) return agents[0] || null;
      const updated = agents.find((a) => a.id === prev.id);
      return updated || prev;
    });
  }, [agents]);

  async function handleRoutineMagicPauta() {
    if (!routineInstruction.trim() || routinePautaMagicUsed || routinePautaBusy) return;
    setRoutinePautaBusy(true);
    setRoutineMagicError('');
    try {
      const res = await api('ai/magic-prompt', 'POST', {
        text: routineInstruction.trim(),
        type: 'instruction',
        agent_id: selected?.id,
      });
      if (res?.refinedText) {
        setRoutineInstruction(res.refinedText);
        setRoutinePautaMagicUsed(true);
      }
    } catch (e) {
      setRoutineMagicError(e instanceof Error ? e.message : 'Falha ao executar Prompt Mágico');
    } finally {
      setRoutinePautaBusy(false);
    }
  }

  async function handleRoutineMagicCta() {
    if (!routineCta.trim() || routineCtaMagicUsed || routineCtaBusy) return;
    setRoutineCtaBusy(true);
    setRoutineMagicError('');
    try {
      const res = await api('ai/magic-prompt', 'POST', {
        text: routineCta.trim(),
        type: 'cta',
        agent_id: selected?.id,
      });
      if (res?.refinedText) {
        setRoutineCta(res.refinedText);
        setRoutineCtaMagicUsed(true);
      }
    } catch (e) {
      setRoutineMagicError(e instanceof Error ? e.message : 'Falha ao executar Prompt Mágico');
    } finally {
      setRoutineCtaBusy(false);
    }
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
                  instruction: routineInstruction,
                  channels: routineChannels,
                  image_count: routineCount,
                  image_style: routineStyle,
                  image_quality: routineQuality,
                  is_carousel: routineCount > 1 && routineIsCarousel,
                  cta: routineCta,
                  destination: routineDestination,
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
            {tab !== 'IA' && tab !== 'routine' && (
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
                {(() => {
                  const currentRefIds = ((selected.visual_settings?.reference_ids || []) as string[]).filter(Boolean);
                  const imageAssets = assets.filter((a) => a.mime_type?.startsWith('image/'));
                  const activeAssets = imageAssets.filter((a) => currentRefIds.includes(a.id));

                  return (
                    <>
                      <div
                        className="section-heading"
                        style={{
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 12,
                          marginTop: 20,
                          marginBottom: 14,
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <h3 style={{ margin: 0 }}>{t('references')}</h3>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 10px',
                                borderRadius: 20,
                                fontSize: '12px',
                                fontWeight: 600,
                                background: currentRefIds.length > 0 ? '#eff6ff' : '#f1f5f9',
                                color: currentRefIds.length > 0 ? '#1d4ed8' : '#64748b',
                                border: currentRefIds.length > 0 ? '1px solid #bfdbfe' : '1px solid #e2e8f0',
                              }}
                            >
                              {currentRefIds.length}{' '}
                              {currentRefIds.length === 1 ? 'referência associada' : 'referências associadas'}
                            </span>
                          </div>
                          <p className="muted" style={{ margin: '4px 0 0', fontSize: '13px' }}>
                            Arquivos da biblioteca utilizados pela IA para manter a identidade visual e o estilo do Gênio.
                          </p>
                        </div>
                        <div className="view-toggle">
                          <button
                            type="button"
                            className={refView === 'thumbnails' ? 'active' : ''}
                            onClick={() => setRefView('thumbnails')}
                            title={t('viewThumbnails')}
                          >
                            <LayoutGrid size={14} />
                          </button>
                          <button
                            type="button"
                            className={refView === 'list' ? 'active' : ''}
                            onClick={() => setRefView('list')}
                            title={t('viewList')}
                          >
                            <List size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Active References Preview Strip */}
                      {activeAssets.length > 0 && (
                        <div
                          style={{
                            marginBottom: 20,
                            padding: '14px 16px',
                            background: '#f8fafc',
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginBottom: 10,
                              flexWrap: 'wrap',
                              gap: 6,
                            }}
                          >
                            <strong style={{ fontSize: '13px', color: '#0f172a' }}>
                              Referências Ativas neste Gênio ({activeAssets.length})
                            </strong>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              Clique no X para desassociar ou selecione outros abaixo
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            {activeAssets.map((a) => (
                              <div
                                key={a.id}
                                style={{
                                  position: 'relative',
                                  width: 100,
                                  borderRadius: 8,
                                  border: '2px solid #3b82f6',
                                  background: '#ffffff',
                                  overflow: 'hidden',
                                  boxShadow: '0 2px 6px rgba(59, 130, 246, 0.15)',
                                }}
                              >
                                <img
                                  src={(a as Asset & { url?: string }).url || ''}
                                  alt={a.name}
                                  style={{ width: '100%', height: 75, objectFit: 'cover', display: 'block' }}
                                />
                                <div
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11px',
                                    fontWeight: 500,
                                    color: '#1e293b',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                  title={a.name}
                                >
                                  {a.name}
                                </div>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ids = currentRefIds.filter((id) => id !== a.id);
                                      setSelected({
                                        ...selected,
                                        visual_settings: {
                                          ...selected.visual_settings,
                                          reference_ids: ids,
                                        },
                                      });
                                    }}
                                    style={{
                                      position: 'absolute',
                                      top: 4,
                                      right: 4,
                                      width: 20,
                                      height: 20,
                                      borderRadius: 10,
                                      background: 'rgba(15, 23, 42, 0.8)',
                                      color: '#ffffff',
                                      border: 'none',
                                      display: 'grid',
                                      placeItems: 'center',
                                      cursor: 'pointer',
                                    }}
                                    title="Desassociar referência"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* All Library Assets to Toggle */}
                      {imageAssets.length === 0 ? (
                        <div
                          style={{
                            padding: '24px 16px',
                            textAlign: 'center',
                            background: '#f8fafc',
                            borderRadius: 12,
                            border: '1px dashed #cbd5e1',
                            margin: '10px 0',
                          }}
                        >
                          <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 12px' }}>
                            Nenhuma imagem encontrada na Biblioteca para associar.
                          </p>
                          <Button secondary type="button" onClick={() => router.push('/library')}>
                            Acessar Biblioteca para enviar imagens
                          </Button>
                        </div>
                      ) : refView === 'list' ? (
                        <div className="grid two" style={{ gap: 10 }}>
                          {imageAssets.map((a) => {
                            const isSelected = currentRefIds.includes(a.id);
                            return (
                              <label
                                key={a.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '8px 12px',
                                  borderRadius: 8,
                                  border: isSelected ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                                  background: isSelected ? '#f0f7ff' : '#ffffff',
                                  cursor: canEdit ? 'pointer' : 'default',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!canEdit}
                                  checked={isSelected}
                                  onChange={(e) => {
                                    setSelected({
                                      ...selected,
                                      visual_settings: {
                                        ...selected.visual_settings,
                                        reference_ids: e.target.checked
                                          ? [...currentRefIds, a.id]
                                          : currentRefIds.filter((id) => id !== a.id),
                                      },
                                    });
                                  }}
                                />
                                {(a as Asset & { url?: string }).url ? (
                                  <img
                                    src={(a as Asset & { url?: string }).url}
                                    alt={a.name}
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 6,
                                      objectFit: 'cover',
                                      border: '1px solid #cbd5e1',
                                      flexShrink: 0,
                                    }}
                                  />
                                ) : null}
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400 }}>{a.name}</div>
                                  <small className="muted">{a.category || 'reference'}</small>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="ref-thumb-grid">
                          {imageAssets.map((a) => {
                            const isSelected = currentRefIds.includes(a.id);
                            return (
                              <div
                                key={a.id}
                                className={`ref-thumb-card${isSelected ? ' selected' : ''}`}
                                onClick={() => {
                                  if (!canEdit) return;
                                  setSelected({
                                    ...selected,
                                    visual_settings: {
                                      ...selected.visual_settings,
                                      reference_ids: isSelected
                                        ? currentRefIds.filter((id) => id !== a.id)
                                        : [...currentRefIds, a.id],
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
                  );
                })()}
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
              <div className="routine-layout-wrapper">
                {/* 1. Um único controle geral de ativação visualmente acima dos três cards */}
                <div className="routine-global-activation-card">
                  <label className="routine-activation-toggle">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={Boolean(schedule.enabled && selected.active)}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setSelected({ ...selected, active: val });
                        setSchedule({ ...schedule, enabled: val });
                      }}
                    />
                    <span className="routine-activation-switch" />
                    <span className="routine-activation-label">{t('activateRoutine')}</span>
                  </label>
                  <span className="routine-activation-hint">
                    {schedule.enabled && selected.active
                      ? t('routineActiveHint')
                      : t('routineInactiveHint')}
                  </span>
                </div>

                <div className="routine-cards-container">
                  {/* Card 1: Nível de independência do Agente */}
                  <div className="routine-card">
                    <div className="routine-card-header">
                      <h3 className="routine-card-title">{t('routineCardIndependence')}</h3>
                    </div>
                    <div className="routine-card-body">
                      <Field label={t('agentName')}>
                        <input
                          disabled={!canEdit}
                          value={selected.name}
                          onChange={(e) => setSelected({ ...selected, name: e.target.value })}
                        />
                      </Field>

                      <Field label={t('mode')}>
                        <select
                          disabled={!canEdit}
                          value={selected.mode === 'AUTONOMOUS' ? 'AUTONOMOUS' : 'ASSISTED'}
                          onChange={(e) => {
                            const newMode = e.target.value as 'ASSISTED' | 'AUTONOMOUS';
                            setSelected({
                              ...selected,
                              mode: newMode,
                              approval_required: newMode === 'ASSISTED',
                            });
                          }}
                        >
                          <option value="ASSISTED">{t('mode_ASSISTED_desc')}</option>
                          <option value="AUTONOMOUS">{t('mode_AUTONOMOUS_desc')}</option>
                        </select>
                      </Field>

                      <div className="routine-checkboxes-row">
                        <label className="check routine-checkbox">
                          <input
                            disabled={!canEdit}
                            type="checkbox"
                            checked={selected.research_enabled}
                            onChange={(e) =>
                              setSelected({ ...selected, research_enabled: e.target.checked })
                            }
                          />
                          <span>{t('research')}</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Rotina do Agente */}
                  <div className="routine-card">
                    <div className="routine-card-header">
                      <h3 className="routine-card-title">{t('routineCardRoutine')}</h3>
                    </div>
                    <div className="routine-card-body">
                      <div className="grid two">
                        <Field label={t('timezone')}>
                          <input
                            value={String(schedule.timezone)}
                            onChange={(e) =>
                              setSchedule({ ...schedule, timezone: e.target.value })
                            }
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
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Conteúdo do Agente */}
                  <div className="routine-card">
                    <div className="routine-card-header">
                      <h3 className="routine-card-title">{t('routineCardContent')}</h3>
                    </div>
                    <div className="routine-card-body">
                      {/* Estilo da Imagem */}
                      <div className="new-content-field">
                        <label className="new-content-label">Estilo da Imagem *</label>
                        <div className="new-content-input-wrapper">
                          <Palette size={18} className="field-prefix-icon" />
                          <select
                            disabled={!canEdit}
                            value={routineStyle}
                            onChange={(e) => setRoutineStyle(e.target.value)}
                          >
                            {ROUTINE_IMAGE_STYLES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Pauta / instrução opcional */}
                      <div className="new-content-field">
                        <div className="field-label-with-action">
                          <label className="new-content-label">Pauta / instrução opcional</label>
                          {routinePautaMagicUsed ? (
                            <span className="magic-prompt-badge-used">✓ Prompt Mágico utilizado</span>
                          ) : (
                            <button
                              type="button"
                              className="magic-prompt-btn"
                              disabled={!routineInstruction.trim() || routinePautaBusy || !canEdit}
                              onClick={handleRoutineMagicPauta}
                              title={
                                !routineInstruction.trim()
                                  ? 'Escreva algo na pauta para habilitar o Prompt Mágico'
                                  : 'Melhorar e organizar com IA'
                              }
                            >
                              <Sparkles size={13} className={routinePautaBusy ? 'spin-icon' : ''} />
                              <span>{routinePautaBusy ? 'Melhorando...' : 'Prompt Mágico'}</span>
                            </button>
                          )}
                        </div>
                        <div className="new-content-textarea-wrapper">
                          <FileText size={18} className="textarea-prefix-icon" />
                          <textarea
                            disabled={!canEdit}
                            value={routineInstruction}
                            onChange={(e) => setRoutineInstruction(e.target.value)}
                            placeholder="Descreva a orientação persistente para os conteúdos desta rotina..."
                            maxLength={10000}
                            rows={3}
                          />
                        </div>
                      </div>

                      {/* Canais de publicação */}
                      <div className="new-content-field">
                        <div className="channel-section-header">
                          <label className="new-content-label">Canais de publicação</label>
                          <p className="new-content-sublabel">
                            A Rotina gerará conteúdo e formatos exclusivos para os canais selecionados abaixo.
                          </p>
                        </div>
                        <div className="new-content-channels-grid">
                          {ALL_ROUTINE_CHANNELS.map((ch) => {
                            const isChecked = routineChannels.includes(ch);
                            return (
                              <div
                                key={ch}
                                className={`new-content-channel-card ${isChecked ? 'selected' : ''}`}
                                role="checkbox"
                                aria-checked={isChecked}
                                tabIndex={canEdit ? 0 : -1}
                                onClick={() => {
                                  if (!canEdit) return;
                                  setRoutineChannels((prev) =>
                                    prev.includes(ch)
                                      ? prev.filter((v) => v !== ch).length === 0
                                        ? prev
                                        : prev.filter((v) => v !== ch)
                                      : [...prev, ch],
                                  );
                                }}
                                onKeyDown={(e) => {
                                  if (!canEdit) return;
                                  if (e.key === ' ' || e.key === 'Enter') {
                                    e.preventDefault();
                                    setRoutineChannels((prev) =>
                                      prev.includes(ch)
                                        ? prev.filter((v) => v !== ch).length === 0
                                          ? prev
                                          : prev.filter((v) => v !== ch)
                                        : [...prev, ch],
                                    );
                                  }
                                }}
                              >
                                <div className="channel-card-logo">
                                  <SocialLogo channel={ch} size={32} />
                                </div>
                                <div className="channel-card-info">
                                  <strong className="channel-card-name">{channels[ch].name}</strong>
                                  <span className="channel-card-ratio">{channels[ch].ratio}</span>
                                </div>
                                <div className={`channel-card-checkbox ${isChecked ? 'checked' : ''}`}>
                                  {isChecked && <Check size={14} strokeWidth={3} />}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Qualidade da Imagem */}
                      <div className="new-content-field">
                        <label className="new-content-label">Qualidade da Imagem</label>
                        <div className="quality-segmented-control">
                          <button
                            type="button"
                            disabled={!canEdit}
                            className={`quality-pill ${routineQuality === 'low' ? 'active' : ''}`}
                            onClick={() => setRoutineQuality('low')}
                          >
                            <span className="quality-pill-name">Padrão</span>
                            <span className="quality-pill-multiplier">1x cota</span>
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit}
                            className={`quality-pill ${routineQuality === 'medium' ? 'active' : ''}`}
                            onClick={() => setRoutineQuality('medium')}
                          >
                            <span className="quality-pill-name">Premium</span>
                            <span className="quality-pill-multiplier">3x cotas</span>
                          </button>
                        </div>
                      </div>

                      {/* Imagens por canal & Cálculo de Cotas em tempo real */}
                      <div className="new-content-field">
                        <label className="new-content-label">Imagens por canal</label>
                        <div className="image-count-stepper-row">
                          <div className="image-count-stepper">
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={routineCount <= 1 || !canEdit}
                              onClick={() => { if (routineCount <= 2) setRoutineIsCarousel(false); setRoutineCount((prev) => Math.max(1, prev - 1)); }}
                              aria-label="Diminuir imagens"
                            >
                              <Minus size={16} />
                            </button>
                            <span className="stepper-value">{routineCount}</span>
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={routineCount >= 6 || !canEdit}
                              onClick={() => setRoutineCount((prev) => Math.min(6, prev + 1))}
                              aria-label="Aumentar imagens"
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                          <div className="total-consumption-badge">
                            <span>
                              o total de conteúdos consumidos será{' '}
                              <strong>
                                {routineCount *
                                  routineChannels.length *
                                  (routineQuality === 'medium' ? 3 : 1)}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* É carrossel? */}
                      <div className="new-content-carousel-row">
                        <div className="carousel-toggle-label">
                          <Layers size={18} className="carousel-icon" />
                          <span>É carrossel?</span>
                        </div>
                        <div className="carousel-segmented-control">
                          <button
                            type="button"
                            disabled={!canEdit || routineCount <= 1}
                            className={`carousel-pill ${routineIsCarousel ? 'active' : ''}`}
                            onClick={() => setRoutineIsCarousel(true)}
                          >
                            Sim
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit}
                            className={`carousel-pill ${!routineIsCarousel ? 'active' : ''}`}
                            onClick={() => setRoutineIsCarousel(false)}
                          >
                            Não
                          </button>
                        </div>
                      </div>

                      {/* Onde deseja publicar? */}
                      <div className="new-content-carousel-row">
                        <div className="carousel-toggle-label">
                          <Send size={18} className="carousel-icon" />
                          <span>Onde deseja publicar?</span>
                        </div>
                        <div className="carousel-segmented-control">
                          {supportedRoutineDestinations.map((d) => (
                            <button
                              key={d}
                              type="button"
                              disabled={!canEdit}
                              className={`carousel-pill ${routineDestination === d ? 'active' : ''}`}
                              onClick={() => setRoutineDestination(d)}
                            >
                              {destinations[d].label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="new-content-field">
                        <div className="field-label-with-action">
                          <label className="new-content-label">CTA</label>
                          {routineCtaMagicUsed ? (
                            <span className="magic-prompt-badge-used">✓ Prompt Mágico utilizado</span>
                          ) : (
                            <button
                              type="button"
                              className="magic-prompt-btn"
                              disabled={!routineCta.trim() || routineCtaBusy || !canEdit}
                              onClick={handleRoutineMagicCta}
                              title={
                                !routineCta.trim()
                                  ? 'Escreva uma chamada para ação para habilitar o Prompt Mágico'
                                  : 'Melhorar CTA com IA'
                              }
                            >
                              <Sparkles size={13} className={routineCtaBusy ? 'spin-icon' : ''} />
                              <span>{routineCtaBusy ? 'Melhorando...' : 'Prompt Mágico'}</span>
                            </button>
                          )}
                        </div>
                        <div className="new-content-input-wrapper">
                          <MousePointerClick size={18} className="field-prefix-icon" />
                          <input
                            type="text"
                            disabled={!canEdit}
                            value={routineCta}
                            onChange={(e) => setRoutineCta(e.target.value)}
                            placeholder="Ex.: Saiba mais, Garanta o seu, Acesse agora..."
                            maxLength={500}
                          />
                        </div>
                      </div>

                      {routineMagicError && <Notice message={routineMagicError} error />}
                    </div>
                  </div>
                </div>
              </div>
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
                      const routineSettingsToSave =
                        tab === 'routine'
                          ? {
                              image_style: routineStyle,
                              instruction: routineInstruction,
                              channels: routineChannels,
                              image_quality: routineQuality,
                              image_count: routineCount,
                              is_carousel: routineCount > 1 && routineIsCarousel,
                              cta: routineCta,
                              destination: routineDestination,
                            }
                          : ((selected.routine_settings as Record<string, unknown>) || {});

                      const saved = await api('agents', 'POST', {
                        ...selected,
                        routine_settings: routineSettingsToSave,
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
                          enabled: Boolean(schedule.enabled && selected.active),
                        });
                        setSchedule((prev) => ({
                          ...prev,
                          agent_id: saved.id,
                          timezone: schedule.timezone,
                          local_time: schedule.local_time,
                          weekdays: parsedWeekdays.length ? parsedWeekdays : [1, 2, 3, 4, 5],
                          enabled: Boolean(schedule.enabled && selected.active),
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
