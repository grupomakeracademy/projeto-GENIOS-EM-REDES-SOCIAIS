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
  contentGenerationQuota,
  MAX_CONTENT_INSTRUCTION_LENGTH,
  publicationChannels,
  publicationRatio,
  type PublicationType,
} from '@/lib/domain';

const ALL_CHANNELS = publicationChannels.feed;
type VisualReference = { id: string; name: string; url?: string; summary_text: string; processing_status: string; asset_subtype?: string | null };
const instructionLimitMessage = 'A pauta deve ter no máximo 2.000 caracteres.';

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
  const referenceMenu = useRef<HTMLDetailsElement>(null);
  const referenceFileInput = useRef<HTMLInputElement>(null);
  const stagedReferenceId = useRef('');
  const isEditing = Boolean(draftItem);

  const [selected, setSelected] = useState('');
  const [selectedChannels, setChannels] = useState<Channel[]>(ALL_CHANNELS);
  const [publicationType, setPublicationType] = useState<PublicationType>('feed');
  const [imageStyle, setImageStyle] = useState('Disney / Pixar');
  const [imageQuality, setImageQuality] = useState<'low' | 'medium'>('low');
  const [instruction, setInstruction] = useState('');
  const [instructionError, setInstructionError] = useState('');
  const [references, setReferences] = useState<VisualReference[]>([]);
  const [referenceAssetId, setReferenceAssetId] = useState('');
  const [referenceSummary, setReferenceSummary] = useState('');
  const [pendingReferenceFile, setPendingReferenceFile] = useState<File | null>(null);
  const [pendingReferenceUrl, setPendingReferenceUrl] = useState('');
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState('');
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
    stagedReferenceId.current = '';
    setPendingReferenceFile(null);
    if (draftItem) {
      const strategy = (draftItem.strategy as Record<string, unknown>) || {};
      const type: PublicationType = strategy.publication_type === 'stories' ? 'stories' : 'feed';
      setPublicationType(type);
      const agentId = draftItem.agent_id || agents[0]?.id || '';
      setSelected(agentId);
      const draftChannels = draftItem.content_variants?.map((v) => v.channel) || [];
      setChannels((draftChannels.length ? draftChannels : (agents.find((a) => a.id === agentId)?.channels || ALL_CHANNELS))
        .filter(channel => publicationChannels[type].includes(channel)));
      setImageStyle(String(strategy.image_style || 'Disney / Pixar'));
      const q = strategy.image_quality as 'low' | 'medium' | undefined;
      setImageQuality(q === 'medium' ? 'medium' : 'low');
      const inst = String(strategy.instruction || (draftItem.topic !== 'Novo rascunho de conteúdo' ? draftItem.topic : '') || '');
      setInstruction(inst);
      setInstructionError(inst.length > MAX_CONTENT_INSTRUCTION_LENGTH ? instructionLimitMessage : '');
      setReferenceAssetId(String(strategy.reference_asset_id || ''));
      const count = Number(strategy.image_count) || 1;
      setImageCount(count);
      setIsCarousel(count >= 2 ? Boolean(strategy.is_carousel) : false);
      setCta(String(strategy.cta || ''));
    } else {
      const firstAgent = agents[0];
      const agentId = firstAgent?.id || '';
      setSelected(agentId);
      setPublicationType('feed');
      setChannels(firstAgent?.channels?.length ? firstAgent.channels : ALL_CHANNELS);
      setImageStyle('Disney / Pixar');
      setImageQuality(defaultImageQuality === 'medium' ? 'medium' : 'low');
      setInstruction('');
      setInstructionError('');
      setReferenceAssetId('');
      setImageCount(2);
      setIsCarousel(true);
      setCta('');
    }
    setPautaMagicUsed(false);
    setCtaMagicUsed(false);
    setPautaBusy(false);
    setCtaBusy(false);
    setMagicError('');
    setReferenceError('');
    setReferenceSummary('');
    setReferences([]);
    setSavingDraft(false);
  }, [open, draftItem, agents, defaultImageQuality]);

  useEffect(() => {
    if (!open || !selected) return;
    let active = true;
    const draftReferenceId = String(((draftItem?.strategy as Record<string, unknown>) || {}).reference_asset_id || '');
    const query = `assets?agent_id=${encodeURIComponent(selected)}${draftReferenceId ? `&draft_reference_id=${encodeURIComponent(draftReferenceId)}` : ''}`;
    void api(query).then((res) => {
      if (active) {
        const items = (res.items || []) as VisualReference[];
        setReferences(items);
        if (draftReferenceId) setReferenceSummary(items.find(item => item.id === draftReferenceId)?.summary_text || '');
      }
    }).catch((e) => {
      if (active) setReferenceError(e instanceof Error ? e.message : 'Não foi possível carregar as referências.');
    });
    return () => { active = false; };
  }, [open, selected, draftItem]);

  useEffect(() => {
    if (!pendingReferenceFile) {
      setPendingReferenceUrl('');
      return;
    }
    const url = URL.createObjectURL(pendingReferenceFile);
    setPendingReferenceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingReferenceFile]);

  useEffect(() => {
    const input = referenceFileInput.current;
    if (!open || !input) return;
    // The native file picker's cancel event bubbles into the parent <dialog>.
    // It must not be interpreted as a request to close the content form.
    const keepModalOpen = (event: Event) => event.stopPropagation();
    input.addEventListener('cancel', keepModalOpen);
    return () => input.removeEventListener('cancel', keepModalOpen);
  }, [open]);

  const selectedReference = references.find((item) => item.id === referenceAssetId);
  const referenceDescriptionUnsaved = Boolean(selectedReference && selectedReference.processing_status === 'processed' &&
    referenceSummary.trim() !== selectedReference.summary_text);

  function updateInstruction(value: string) {
    if (value.length > MAX_CONTENT_INSTRUCTION_LENGTH) {
      setInstructionError(instructionLimitMessage);
      return;
    }
    setInstruction(value);
    setInstructionError('');
  }

  function selectReferenceFile(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        !/\.(png|jpe?g|webp)$/i.test(file.name) || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setReferenceError('Envie uma imagem PNG, JPG ou WebP válida de até 10 MB.');
      return;
    }
    setReferenceError('');
    stagedReferenceId.current = '';
    setPendingReferenceFile(file);
    setReferenceAssetId('');
    setReferenceSummary('');
  }

  async function stageReference(file: File): Promise<string> {
    let id = stagedReferenceId.current;
    if (!id) {
      const data = new FormData();
      data.set('file', file);
      data.set('category', 'reference');
      data.set('source', 'content_reference');
      const uploaded = await api('assets', 'POST', data);
      id = uploaded.id;
      stagedReferenceId.current = id;
    }
    await api('assets', 'PATCH', { action: 'associate', id, agent_ids: [selected] });
    return id;
  }

  async function referenceForGeneration(): Promise<string> {
    const id = pendingReferenceFile ? await stageReference(pendingReferenceFile) : referenceAssetId;
    if (!id) return '';
    if (pendingReferenceFile || selectedReference?.asset_subtype === 'content_reference_staged') {
      await api('assets', 'PATCH', { action: 'process', id });
      const result = await api(`assets?agent_id=${encodeURIComponent(selected)}`);
      const items = (result.items || []) as VisualReference[];
      const ready = items.find(item => item.id === id);
      if (!ready) throw new Error('A referência foi processada, mas não pôde ser carregada. Tente novamente.');
      setReferences(items);
      setReferenceAssetId(id);
      setReferenceSummary(ready.summary_text);
      setPendingReferenceFile(null);
    }
    return id;
  }

  async function saveReferenceSummary() {
    if (!selectedReference || !referenceSummary.trim() || referenceBusy) return;
    setReferenceBusy(true);
    setReferenceError('');
    try {
      const result = await api('assets', 'PATCH', {
        action: 'update_summary', id: selectedReference.id, agent_id: selected,
        summary_text: referenceSummary.trim(),
      });
      setReferences(prev => prev.map(item => item.id === selectedReference.id
        ? { ...item, summary_text: result.summary_text } : item));
      setReferenceSummary(result.summary_text);
    } catch (e) {
      setReferenceError(e instanceof Error ? e.message : 'Não foi possível salvar a descrição.');
    } finally {
      setReferenceBusy(false);
    }
  }

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
        if (res.refinedText.length > MAX_CONTENT_INSTRUCTION_LENGTH) throw new Error(instructionLimitMessage);
        updateInstruction(res.refinedText);
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
    if (savingDraft || action.busy || referenceBusy || referenceDescriptionUnsaved || instructionError || instruction.length > MAX_CONTENT_INSTRUCTION_LENGTH || !selected || selectedChannels.length === 0) return;
    setSavingDraft(true);
    setMagicError('');
    try {
      const payload = {
        agent_id: selected,
        instruction: instruction.trim(),
        reference_asset_id: pendingReferenceFile ? await stageReference(pendingReferenceFile) : (referenceAssetId || null),
        image_style: imageStyle,
        is_carousel: isCarouselDisabled ? false : isCarousel,
        cta: cta.trim(),
        channels: selectedChannels,
        publication_type: publicationType,
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
    if (submission.current.busy || action.busy || savingDraft || referenceBusy || referenceDescriptionUnsaved || instructionError || instruction.length > MAX_CONTENT_INSTRUCTION_LENGTH || !selected || selectedChannels.length === 0) return;
    setMagicError('');
    submission.current.busy = true;
    void action.act(async () => {
      const activeReferenceId = await referenceForGeneration();
      const payload: Record<string, unknown> = {
        agent_id: selected,
        instruction: instruction.trim(),
        ...(activeReferenceId ? { reference_asset_id: activeReferenceId } : {}),
        image_style: imageStyle,
        is_carousel: isCarouselDisabled ? false : isCarousel,
        cta: cta.trim(),
        channels: selectedChannels,
        publication_type: publicationType,
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
                setReferenceAssetId('');
                setReferenceSummary('');
                const agent = agents.find((a) => a.id === e.target.value);
                if (agent?.channels?.length) setChannels(agent.channels.filter(channel => publicationChannels[publicationType].includes(channel)));
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
              onChange={(e) => updateInstruction(e.target.value)}
              placeholder="Descreva a ideia, tema ou instruções para as imagens..."
              aria-describedby="content-instruction-counter"
              rows={3}
            />
          </div>
          <div id="content-instruction-counter" className="new-content-character-count">{instruction.length} / {MAX_CONTENT_INSTRUCTION_LENGTH}</div>
          {instructionError && <Notice message={instructionError} error />}
        </div>

        <div className="new-content-field">
          <span className="new-content-label">Imagem de referência</span>
          <p className="new-content-sublabel">A pauta define a cena; a referência orienta a aparência. Uma referência selecionada dobra a cota desta geração.</p>
          <details ref={referenceMenu} className="new-content-reference-picker" id="content-reference" data-reference-id={referenceAssetId}>
            <summary aria-label="Selecionar imagem de referência">{pendingReferenceFile?.name || selectedReference?.name || 'Sem referência'}</summary>
            <div className="new-content-reference-list" role="listbox" aria-label="Biblioteca de referências">
              <button type="button" role="option" aria-selected={!referenceAssetId && !pendingReferenceFile}
                onClick={() => { setPendingReferenceFile(null); stagedReferenceId.current = ''; setReferenceAssetId(''); setReferenceSummary(''); if (referenceMenu.current) referenceMenu.current.open = false; }}>
                <span className="new-content-reference-thumb"><FileText size={22} aria-hidden="true" /></span>
                <span>Sem referência</span>
              </button>
              {references.filter(item => item.asset_subtype !== 'content_reference_staged').map(item => <button key={item.id} type="button" role="option" aria-selected={referenceAssetId === item.id}
                onClick={() => { setPendingReferenceFile(null); stagedReferenceId.current = ''; setReferenceAssetId(item.id); setReferenceSummary(item.summary_text); if (referenceMenu.current) referenceMenu.current.open = false; }}>
                <span className="new-content-reference-thumb">
                  <FileText size={22} aria-hidden="true" />
                  {item.url && <img src={item.url} alt="" width={64} height={56} loading="lazy"
                    onError={event => { event.currentTarget.hidden = true; }} />}
                </span>
                <span className="new-content-reference-name">{item.name}</span>
              </button>)}
            </div>
          </details>
          <label className="new-content-reference-upload">
            <input ref={referenceFileInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={referenceBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) selectReferenceFile(file);
              }} />
          </label>
          {referenceBusy && <p className="new-content-sublabel">Preparando referência...</p>}
          {referenceAssetId && !selectedReference && !referenceBusy && <Notice message="A referência deste rascunho não está disponível para este agente. Remova-a ou selecione outra." error />}
          {pendingReferenceFile && pendingReferenceUrl && <div className="new-content-reference-preview">
            <img src={pendingReferenceUrl} alt={pendingReferenceFile.name} />
            <p className="new-content-sublabel">A descrição visual será criada ao clicar em Gerar agora.</p>
            <Button secondary type="button" onClick={() => { setPendingReferenceFile(null); stagedReferenceId.current = ''; }}>Remover referência</Button>
          </div>}
          {selectedReference && <div className="new-content-reference-preview">
            {selectedReference.url && <img src={selectedReference.url} alt={selectedReference.name} />}
            {selectedReference.asset_subtype === 'content_reference_staged' ?
              <p className="new-content-sublabel">A descrição visual será criada ao clicar em Gerar agora.</p> : <>
                <label className="new-content-label" htmlFor="content-reference-summary">Descrição visual editável</label>
                <textarea id="content-reference-summary" value={referenceSummary} maxLength={6000} disabled={referenceBusy}
                  onChange={(e) => setReferenceSummary(e.target.value)} rows={4} />
              </>}
            <div className="new-content-reference-actions">
              {selectedReference.asset_subtype !== 'content_reference_staged' && <Button secondary type="button" disabled={referenceBusy || !referenceSummary.trim() || referenceSummary === selectedReference.summary_text}
                onClick={() => void saveReferenceSummary()}>Salvar descrição</Button>}
              <Button secondary type="button" disabled={referenceBusy} onClick={() => { setReferenceAssetId(''); setReferenceSummary(''); }}>Remover referência</Button>
            </div>
          </div>}
          {referenceDescriptionUnsaved && <p className="new-content-sublabel">Salve a descrição antes de gerar ou salvar o rascunho.</p>}
          {referenceError && <Notice message={referenceError} error />}
        </div>

        <div className="new-content-field">
          <label className="new-content-label">Tipo de publicação</label>
          <div className="quality-segmented-control" role="group" aria-label="Tipo de publicação">
            {(['feed', 'stories'] as const).map(type => <button key={type} type="button"
              className={`quality-pill ${publicationType === type ? 'active' : ''}`}
              onClick={() => { setPublicationType(type); setChannels(previous => previous.filter(channel => publicationChannels[type].includes(channel))); }}>
              {type === 'feed' ? 'Feed' : 'Stories'}
            </button>)}
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
            {publicationChannels[publicationType].map((ch) => {
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
                      <span className="channel-ratio">{ch === 'whatsapp' && publicationType === 'stories' ? 'Status · ' : ''}{publicationRatio(publicationType, ch)}</span>
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
                  {contentGenerationQuota(imageCount, selectedChannels.length, imageQuality,
                    Boolean(referenceAssetId || pendingReferenceFile))}
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
            disabled={action.busy || savingDraft || referenceBusy || referenceDescriptionUnsaved || Boolean(instructionError) || !selected || selectedChannels.length === 0}
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
              disabled={!selected || selectedChannels.length === 0 || savingDraft || referenceBusy || referenceDescriptionUnsaved || Boolean(instructionError) || Boolean(referenceAssetId && !selectedReference)}
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
