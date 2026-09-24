'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Users,
  Palette,
  FileText,
  Minus,
  Plus,
  Layers,
  MousePointerClick,
} from 'lucide-react';
import {
  Button,
  Modal,
  Notice,
  useAction,
  api,
} from '@/components/ui';
import { SocialLogo } from '@/components/social-logos';
import {
  channels,
  type Agent,
  type Content,
  type Channel,
  QUALITY_MULTIPLIERS,
} from '@/lib/domain';

const ALL_CHANNELS: Channel[] = ['instagram', 'facebook', 'whatsapp', 'tiktok', 'x', 'linkedin'];

export function ContentFormModal({
  open,
  onClose,
  agents,
  defaultImageQuality = 'low',
  draftItem = null,
  onSaved,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  defaultImageQuality?: 'low' | 'medium';
  draftItem?: Content | null;
  onSaved?: () => void;
  onGenerated?: () => void;
}) {
  const action = useAction();
  const submission = useRef({ busy: false, key: '' });
  const isEditing = Boolean(draftItem);

  const [selected, setSelected] = useState('');
  const [selectedChannels, setChannels] = useState<Channel[]>(ALL_CHANNELS);
  const [imageStyle, setImageStyle] = useState('Disney / Pixar');
  const [imageQuality, setImageQuality] = useState<'low' | 'medium'>('low');
  const [instruction, setInstruction] = useState('');
  const [imageCount, setImageCount] = useState(2);
  const [isCarousel, setIsCarousel] = useState(true);
  const [cta, setCta] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);
  const [pautaMagicUsed, setPautaMagicUsed] = useState(false);
  const [pautaBusy, setPautaBusy] = useState(false);
  const [ctaMagicUsed, setCtaMagicUsed] = useState(false);
  const [ctaBusy, setCtaBusy] = useState(false);
  const [magicError, setMagicError] = useState('');

  useEffect(() => {
    if (!open) return;
    submission.current = { busy: false, key: crypto.randomUUID() };
    if (draftItem) {
      const strategy = (draftItem.strategy as Record<string, unknown>) || {};
      const agentId = draftItem.agent_id || agents[0]?.id || '';
      setSelected(agentId);
      const draftChannels = draftItem.content_variants?.map((v) => v.channel) || [];
      setChannels(draftChannels.length ? draftChannels : (agents.find((a) => a.id === agentId)?.channels || ALL_CHANNELS));
      setImageStyle(String(strategy.image_style || 'Disney / Pixar'));
      const q = strategy.image_quality as 'low' | 'medium' | undefined;
      setImageQuality(q === 'medium' ? 'medium' : 'low');
      const inst = String(strategy.instruction || (draftItem.topic !== 'Novo rascunho de conteúdo' ? draftItem.topic : '') || '');
      setInstruction(inst);
      const count = Number(strategy.image_count) || 1;
      setImageCount(count);
      setIsCarousel(count >= 2 ? Boolean(strategy.is_carousel) : false);
      setCta(String(strategy.cta || ''));
    } else {
      const firstAgent = agents[0];
      const agentId = firstAgent?.id || '';
      setSelected(agentId);
      setChannels(firstAgent?.channels?.length ? firstAgent.channels : ALL_CHANNELS);
      setImageStyle('Disney / Pixar');
      setImageQuality(defaultImageQuality === 'medium' ? 'medium' : 'low');
      setInstruction('');
      setImageCount(2);
      setIsCarousel(true);
      setCta('');
    }
    setPautaMagicUsed(false);
    setCtaMagicUsed(false);
    setPautaBusy(false);
    setCtaBusy(false);
    setMagicError('');
    setSavingDraft(false);
  }, [open, draftItem, agents, defaultImageQuality]);

  const isCarouselDisabled = imageCount <= 1;

  function updateImageCount(next: number) {
    const clamped = Math.max(1, Math.min(6, next));
    if (clamped <= 1) {
      setIsCarousel(false);
    }
    setImageCount(clamped);
  }

  async function handleMagicPauta() {
    if (!instruction.trim() || pautaMagicUsed || pautaBusy) return;
    setPautaBusy(true);
    setMagicError('');
    try {
      const res = await api('ai/magic-prompt', 'POST', {
        text: instruction.trim(),
        type: 'instruction',
        agent_id: selected,
      });
      if (res?.refinedText) {
        setInstruction(res.refinedText);
        setPautaMagicUsed(true);
      }
    } catch (e) {
      setMagicError(e instanceof Error ? e.message : 'Falha ao executar Prompt Mágico');
    } finally {
      setPautaBusy(false);
    }
  }

  async function handleMagicCta() {
    if (!cta.trim() || ctaMagicUsed || ctaBusy) return;
    setCtaBusy(true);
    setMagicError('');
    try {
      const res = await api('ai/magic-prompt', 'POST', {
        text: cta.trim(),
        type: 'cta',
        agent_id: selected,
      });
      if (res?.refinedText) {
        setCta(res.refinedText);
        setCtaMagicUsed(true);
      }
    } catch (e) {
      setMagicError(e instanceof Error ? e.message : 'Falha ao executar Prompt Mágico');
    } finally {
      setCtaBusy(false);
    }
  }

  async function handleSaveDraft() {
    if (savingDraft || action.busy || !selected || selectedChannels.length === 0) return;
    setSavingDraft(true);
    setMagicError('');
    try {
      const payload = {
        agent_id: selected,
        instruction: instruction.trim(),
        image_style: imageStyle,
        is_carousel: isCarouselDisabled ? false : isCarousel,
        cta: cta.trim(),
        channels: selectedChannels,
        image_count: Number(imageCount),
        image_quality: imageQuality,
        status: 'DRAFT' as const,
      };

      if (isEditing && draftItem) {
        // UPDATE existing draft - preserves ID, user/workspace ownership, history
        await api(`content/${draftItem.id}`, 'PATCH', payload);
      } else {
        // INSERT new draft
        await api('content', 'POST', payload);
      }
      onClose();
      onSaved?.();
    } catch (e) {
      setMagicError(e instanceof Error ? e.message : 'Falha ao salvar rascunho');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleGenerateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submission.current.busy || action.busy || savingDraft || !selected || selectedChannels.length === 0) return;
    setMagicError('');
    submission.current.busy = true;
    void action.act(async () => {
      const payload: Record<string, unknown> = {
        agent_id: selected,
        instruction: instruction.trim(),
        image_style: imageStyle,
        is_carousel: isCarouselDisabled ? false : isCarousel,
        cta: cta.trim(),
        channels: selectedChannels,
        image_count: Number(imageCount),
        image_quality: imageQuality,
        idempotency_key: submission.current.key,
      };

      if (isEditing && draftItem) {
        payload.content_id = draftItem.id;
      }

      await api('runs', 'POST', payload);
      onClose();
      onGenerated?.();
    }, 'enqueued').finally(() => { submission.current.busy = false; });
  }

  if (!open) return null;

  return (
    <Modal
      title={isEditing ? 'Revisar conteúdo' : 'Novo conteúdo'}
      subtitle={
        isEditing
          ? 'Edite as configurações do seu rascunho para gerar ou salvar.'
          : 'Configure os detalhes para gerar seu conteúdo.'
      }
      icon={<Sparkles size={20} className="modal-sparkle-icon" />}
      className="modal-new-content"
      onClose={onClose}
    >
      <form className="new-content-form" onSubmit={handleGenerateSubmit}>
        <div className="new-content-field">
          <label className="new-content-label">Agentes</label>
          <div className="new-content-input-wrapper">
            <Users size={18} className="field-prefix-icon" />
            <select
              value={selected}
              required
              onChange={(e) => {
                setSelected(e.target.value);
                const agent = agents.find((a) => a.id === e.target.value);
                if (agent?.channels?.length) setChannels(agent.channels);
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="new-content-field">
          <label className="new-content-label">Estilo da Imagem *</label>
          <div className="new-content-input-wrapper">
            <Palette size={18} className="field-prefix-icon" />
            <select
              value={imageStyle}
              required
              onChange={(e) => setImageStyle(e.target.value)}
            >
              <option value="Disney / Pixar">Disney / Pixar</option>
              <option value="Foto Realista">Foto Realista</option>
              <option value="Anime / Mangá">Anime / Mangá</option>
              <option value="Aquarela Artística">Aquarela Artística</option>
              <option value="Cyberpunk / Neon">Cyberpunk / Neon</option>
              <option value="Minimalista 3D">Minimalista 3D</option>
              <option value="Vintage / Retrô Clássico">Vintage / Retrô Clássico</option>
              <option value="Pintura a Óleo / Belas Artes">Pintura a Óleo / Belas Artes</option>
              <option value="Flat Design Corporativo">Flat Design Corporativo</option>
            </select>
          </div>
        </div>

        <div className="new-content-field">
          <div className="field-label-with-action">
            <label className="new-content-label">Pauta / instrução opcional</label>
            {pautaMagicUsed ? (
              <span className="magic-prompt-badge-used">✓ Prompt Mágico utilizado</span>
            ) : (
              <button
                type="button"
                className="magic-prompt-btn"
                disabled={!instruction.trim() || pautaBusy}
                onClick={handleMagicPauta}
                title={
                  !instruction.trim()
                    ? 'Escreva algo na pauta para habilitar o Prompt Mágico'
                    : 'Melhorar e organizar com IA'
                }
              >
                <Sparkles size={13} className={pautaBusy ? 'spin-icon' : ''} />
                <span>{pautaBusy ? 'Melhorando...' : 'Prompt Mágico'}</span>
              </button>
            )}
          </div>
          <div className="new-content-textarea-wrapper">
            <FileText size={18} className="textarea-prefix-icon" />
            <textarea
              name="instruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Descreva a ideia, tema ou instruções para as imagens..."
              maxLength={10000}
              rows={3}
            />
          </div>
        </div>

        <div className="new-content-field">
          <div className="channel-section-header">
            <label className="new-content-label">Canais de publicação</label>
            <p className="new-content-sublabel">
              Escolha em quais redes sociais gerar as imagens e o formato ideal para cada uma.
            </p>
          </div>
          <div className="new-content-channels-grid">
            {ALL_CHANNELS.map((ch) => {
              const isChecked = selectedChannels.includes(ch);
              return (
                <div
                  key={ch}
                  className={`new-content-channel-card ${isChecked ? 'selected' : ''}`}
                  role="checkbox"
                  aria-checked={isChecked}
                  tabIndex={0}
                  onClick={() =>
                    setChannels((prev) =>
                      prev.includes(ch) ? prev.filter((v) => v !== ch) : [...prev, ch],
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      setChannels((prev) =>
                        prev.includes(ch) ? prev.filter((v) => v !== ch) : [...prev, ch],
                      );
                    }
                  }}
                >
                  <div className="channel-card-left">
                    <span className="channel-logo-wrapper">
                      <SocialLogo channel={ch} size={28} />
                    </span>
                    <div className="channel-card-info">
                      <span className="channel-name">{channels[ch].name}</span>
                      <span className="channel-ratio">{channels[ch].ratio}</span>
                    </div>
                  </div>
                  <div className="channel-checkbox-indicator">
                    {isChecked && (
                      <svg
                        className="channel-check-svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="new-content-field">
          <label className="new-content-label">Qualidade da Imagem</label>
          <div className="quality-segmented-control">
            <button
              type="button"
              className={`quality-pill ${imageQuality === 'low' ? 'active' : ''}`}
              onClick={() => setImageQuality('low')}
            >
              <span className="quality-pill-name">Padrão</span>
              <span className="quality-pill-multiplier">1x cota</span>
            </button>
            <button
              type="button"
              className={`quality-pill ${imageQuality === 'medium' ? 'active' : ''}`}
              onClick={() => setImageQuality('medium')}
            >
              <span className="quality-pill-name">Premium</span>
              <span className="quality-pill-multiplier">3x cota</span>
            </button>
          </div>
        </div>

        <div className="new-content-field">
          <label className="new-content-label">Imagens por canal</label>
          <div className="image-count-stepper-row">
            <div className="image-count-stepper">
              <button
                type="button"
                className="stepper-btn"
                disabled={imageCount <= 1}
                onClick={() => updateImageCount(imageCount - 1)}
                aria-label="Diminuir imagens"
              >
                <Minus size={16} />
              </button>
              <span className="stepper-value">{imageCount}</span>
              <button
                type="button"
                className="stepper-btn"
                disabled={imageCount >= 6}
                onClick={() => updateImageCount(imageCount + 1)}
                aria-label="Aumentar imagens"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="total-consumption-badge">
              <span>
                o total de conteúdos consumidos será{' '}
                <strong>
                  {imageCount *
                    selectedChannels.length *
                    (QUALITY_MULTIPLIERS[imageQuality] ?? 1)}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* É carrossel? — Desabilitado e false quando Imagens por canal = 1 */}
        <div className="new-content-carousel-row">
          <div className="carousel-toggle-label">
            <Layers size={18} className="carousel-icon" />
            <span>É carrossel?</span>
          </div>
          <div className={`carousel-segmented-control ${isCarouselDisabled ? 'disabled' : ''}`}>
            <button
              type="button"
              disabled={isCarouselDisabled}
              className={`carousel-pill ${!isCarouselDisabled && isCarousel ? 'active' : ''}`}
              onClick={() => !isCarouselDisabled && setIsCarousel(true)}
              title={isCarouselDisabled ? 'Carrossel requer pelo menos 2 imagens por canal' : undefined}
            >
              Sim
            </button>
            <button
              type="button"
              disabled={isCarouselDisabled}
              className={`carousel-pill ${isCarouselDisabled || !isCarousel ? 'active' : ''}`}
              onClick={() => !isCarouselDisabled && setIsCarousel(false)}
              title={isCarouselDisabled ? 'Carrossel requer pelo menos 2 imagens por canal' : undefined}
            >
              Não
            </button>
          </div>
        </div>

        <div className="new-content-field">
          <div className="field-label-with-action">
            <label className="new-content-label">CTA</label>
            {ctaMagicUsed ? (
              <span className="magic-prompt-badge-used">✓ Prompt Mágico utilizado</span>
            ) : (
              <button
                type="button"
                className="magic-prompt-btn"
                disabled={!cta.trim() || ctaBusy}
                onClick={handleMagicCta}
                title={
                  !cta.trim()
                    ? 'Escreva uma chamada para ação para habilitar o Prompt Mágico'
                    : 'Melhorar CTA com IA'
                }
              >
                <Sparkles size={13} className={ctaBusy ? 'spin-icon' : ''} />
                <span>{ctaBusy ? 'Melhorando...' : 'Prompt Mágico'}</span>
              </button>
            )}
          </div>
          <div className="new-content-input-wrapper">
            <MousePointerClick size={18} className="field-prefix-icon" />
            <input
              type="text"
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Ex.: Saiba mais, Garanta o seu, Acesse agora..."
              maxLength={500}
            />
          </div>
        </div>

        {magicError && <Notice message={magicError} error />}
        <Notice {...action} />

        <div className="new-content-modal-footer">
          <button
            type="button"
            className="btn-save-draft"
            disabled={action.busy || savingDraft || !selected || selectedChannels.length === 0}
            onClick={handleSaveDraft}
          >
            <FileText size={16} />
            <span>{savingDraft ? 'Salvando...' : 'Salvar como rascunho'}</span>
          </button>
          <div className="modal-footer-right">
            <Button secondary type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="btn-generate-gradient"
              disabled={!selected || selectedChannels.length === 0 || savingDraft}
              busy={action.busy}
              type="submit"
            >
              <Sparkles size={16} />
              <span>{isEditing ? 'Gerar Conteúdo' : 'Gerar agora'}</span>
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
