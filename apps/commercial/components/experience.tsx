'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Fingerprint,
  Layers3,
  MessageSquare,
  Palette,
  Target,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react';
import { difficulties, employeeRanges, leadSchema, maskPhone } from '../lib/leads';

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      className={small ? 'brand-mark' : 'genio-mark'}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M60 4C68 4 66 34 79 42C91 49 116 49 116 60C116 70 89 69 79 79C69 89 70 116 60 116C49 116 50 90 41 80C31 69 4 70 4 60C4 49 30 49 41 40C51 30 50 4 60 4Z"
        fill="currentColor"
      />
      <path d="M60 34V86M34 60H86" stroke="white" strokeOpacity=".36" strokeWidth="1" />
    </svg>
  );
}
export function Header({ login }: { login: string }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <a className="brand" href="#inicio" aria-label="Gênio em Redes Sociais, início">
        <Mark small />
        <span>
          gênio<span>em redes sociais</span>
        </span>
      </a>
      <button
        className="menu-toggle"
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <Menu />}
      </button>
      <nav
        className={open ? 'nav open' : 'nav'}
        aria-label="Navegação principal"
        onClick={() => setOpen(false)}
      >
        <a href="#inteligencia">A solução</a>
        <a href="#sua-marca">Seu Gênio</a>
        <a href="#autonomia">Como funciona</a>
        <a href="#duvidas">Dúvidas</a>
        <a className="subscriber" href={login}>
          Já sou assinante <ChevronRight size={14} />
        </a>
        <a className="button small" href="#conversa">
          Quero começar <ArrowRight size={16} />
        </a>
      </nav>
    </header>
  );
}
export function ScrollStory() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      const p = Math.max(
        0,
        Math.min(1, (window.innerHeight * 0.75 - rect.top) / (rect.height * 0.75)),
      );
      root.style.setProperty('--progress', motion.matches ? '1' : String(p));
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll);
    motion.addEventListener('change', scroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('resize', scroll);
      motion.removeEventListener('change', scroll);
    };
  }, []);
  return (
    <div
      className="chaos-scene"
      ref={ref}
      aria-label="Ideias dispersas convergem para uma estratégia"
    >
      <div className="scene-grid" />
      <div className="floating-note note-a">
        <MessageSquare size={19} />
        <span>O que vamos postar hoje?</span>
        <small>Uma nova ideia. Sem direção.</small>
      </div>
      <div className="floating-note note-b">
        <Palette size={19} />
        <span>Esse visual é a nossa cara?</span>
        <small>Mais uma revisão.</small>
      </div>
      <div className="floating-note note-c">
        <Target size={19} />
        <span>E o objetivo da campanha?</span>
        <small>Ficou em outra conversa.</small>
      </div>
      <div className="scene-core">
        <Mark />
      </div>
      <div className="scene-result">
        <Check size={16} /> Contexto conectado. Estratégia presente.
      </div>
    </div>
  );
}
const chapters = [
  {
    title: 'Primeiro, o seu negócio.',
    text: 'Empresa, produtos, público e objetivos. O ponto de partida é entender o que torna sua marca relevante.',
    icon: Fingerprint,
    tags: ['Sua empresa', 'O que você oferece', 'Quem você quer alcançar'],
    sample: 'Uma marca com propósito, público e direção.',
  },
  {
    title: 'Depois, a sua maneira de dizer.',
    text: 'Tom de voz, exemplos de textos e orientações por canal. Uma comunicação reconhecível, em cada rede.',
    icon: MessageSquare,
    tags: ['Seu tom de voz', 'Referências de texto', 'Orientações por canal'],
    sample: 'Próximo. Claro. Com a personalidade da sua marca.',
  },
  {
    title: 'E a sua maneira de aparecer.',
    text: 'Identidade visual, imagens e referências de estilo orientam a criação. A personalização vai além de um prompt.',
    icon: Palette,
    tags: ['Identidade visual', 'Imagens de referência', 'Estilo da marca'],
    sample: 'Texto e imagem contando a mesma história.',
  },
  {
    title: 'Agora, um Gênio com contexto.',
    text: 'As informações se encontram. O planejamento e a criação passam a ter a sua empresa como ponto de partida.',
    icon: Layers3,
    tags: ['Estratégia', 'Comunicação', 'Identidade'],
    sample: 'Sua marca reconhecível. Seu conteúdo conectado.',
  },
];
export function BrandJourney() {
  const [active, setActive] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = container.current?.querySelectorAll('[data-chapter]');
    if (!nodes) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setActive(Number((entry.target as HTMLElement).dataset.chapter));
      },
      { rootMargin: '-25% 0px -45% 0px' },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);
  const current = chapters[active];
  return (
    <div className="journey-layout" ref={container}>
      <div className="journey-sticky">
        <div className="context-canvas">
          <div className="canvas-top">
            <span>O Gênio da sua empresa</span>
            <span className="live-dot" />
          </div>
          <div className={`context-orbit stage-${active}`}>
            <div className="orbit-line" />
            <div className="orbit-line second" />
            <Mark />
            <span className="context-node n1">
              <Fingerprint size={20} />
            </span>
            <span className="context-node n2">
              <MessageSquare size={20} />
            </span>
            <span className="context-node n3">
              <Palette size={20} />
            </span>
          </div>
          <div className="context-tags">
            {current.tags.map((t) => (
              <span key={t}>
                <Check size={12} />
                {t}
              </span>
            ))}
          </div>
          <p className="context-output" aria-live="polite">
            {current.sample}
          </p>
          <div className="journey-dots" aria-label="Etapas da personalização">
            {chapters.map((c, i) => (
              <a
                href={`#etapa-${i}`}
                key={c.title}
                className={i === active ? 'active' : ''}
                aria-label={c.title}
                aria-current={i === active ? 'step' : undefined}
              />
            ))}
          </div>
        </div>
        <small className="demo-caption">Representação conceitual da personalização</small>
      </div>
      <div className="journey-chapters">
        {chapters.map((c, i) => (
          <article
            id={`etapa-${i}`}
            data-chapter={i}
            key={c.title}
            className={active === i ? 'chapter active' : 'chapter'}
          >
            <span className="chapter-number">0{i + 1} /</span>
            <c.icon size={26} />
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            {i === 3 && (
              <a className="text-link" href="#conversa">
                Quero ver isso na minha empresa <ArrowRight size={17} />
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
export function Autonomy() {
  const [auto, setAuto] = useState(false);
  return (
    <div className="autonomy-demo">
      <div className="mode-switch" role="group" aria-label="Nível de autonomia">
        <button aria-pressed={!auto} onClick={() => setAuto(false)}>
          Com aprovação humana
        </button>
        <button aria-pressed={auto} onClick={() => setAuto(true)}>
          Mais autonomia
        </button>
      </div>
      <div className="flow">
        {['Planejamento', 'Criação', ...(!auto ? ['Sua aprovação'] : []), 'Publicação'].map(
          (step, i) => (
            <div key={step} className={step === 'Sua aprovação' ? 'flow-step human' : 'flow-step'}>
              <span>0{i + 1}</span>
              <strong>{step}</strong>
              <ArrowRight size={18} />
            </div>
          ),
        )}
      </div>
      <p aria-live="polite">
        {auto
          ? 'Uma operação com mais autonomia segue as regras definidas para a marca, com autopublicação nas redes compatíveis mediante habilitação da integração oficial.'
          : 'O Gênio planeja e cria. Você revisa e aprova antes de seguir para a publicação. O controle editorial continua com sua empresa.'}
      </p>
      <small>
        A disponibilidade da autopublicação depende da integração habilitada, do tipo de conta e das
        permissões de cada rede. Consulte o especialista sobre a ativação no Gênio.
      </small>
    </div>
  );
}
export function LeadForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [phone, setPhone] = useState('');
  const id = useRef('');
  const locked = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current || savedUrl) return;
    const form = new FormData(event.currentTarget);
    if (!id.current) id.current = crypto.randomUUID();
    const payload = {
      ...Object.fromEntries(form),
      requestId: id.current,
      consent: form.get('consent') === 'on',
    };
    const result = leadSchema.safeParse(payload);
    if (!result.success) {
      setError('Confira os campos e informe um WhatsApp brasileiro com DDD válido.');
      return;
    }
    locked.current = true;
    setBusy(true);
    setError('');
    const conversation = window.open('about:blank', '_blank');
    if (conversation) {
      conversation.opener = null;
      conversation.document.title = 'Preparando sua conversa — Gênio em Redes Sociais';
      conversation.document.body.textContent =
        'Registrando seus dados. O WhatsApp será aberto após a confirmação.';
    }
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.data),
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      if (!response.ok || !body.saved)
        throw new Error(body.error || 'Não foi possível confirmar seu cadastro. Tente novamente.');
      setSavedUrl(body.whatsappUrl);
      if (conversation) conversation.location.replace(body.whatsappUrl);
    } catch (e) {
      conversation?.close();
      setError(
        e instanceof Error && e.name !== 'TimeoutError'
          ? e.message
          : 'A conexão demorou. Tente novamente; os dados continuam preenchidos.',
      );
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  if (savedUrl)
    return (
      <div className="lead-success" role="status">
        <ShieldCheck size={48} />
        <h3>Seu contexto já está registrado.</h3>
        <p>Vamos continuar a conversa no WhatsApp. Se ele não abriu, use o botão abaixo.</p>
        <a className="button" href={savedUrl}>
          Continuar no WhatsApp <ArrowRight size={18} />
        </a>
      </div>
    );
  return (
    <form className="lead-form" onSubmit={submit} aria-busy={busy}>
      <div className="form-heading">
        <span>Vamos conhecer sua empresa.</span>
        <small>Leva cerca de 2 minutos</small>
      </div>
      <div className="form-grid">
        <label>
          Nome da empresa
          <input
            name="company"
            required
            minLength={2}
            maxLength={120}
            autoComplete="organization"
            placeholder="Como sua empresa se chama?"
          />
        </label>
        <label>
          E-mail
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            placeholder="voce@empresa.com.br"
          />
        </label>
        <label>
          WhatsApp
          <input
            name="whatsapp"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
            maxLength={16}
            autoComplete="tel-national"
            inputMode="tel"
            placeholder="(19) 99999-9999"
          />
        </label>
        <label>
          Ramo de atuação
          <input
            name="sector"
            required
            minLength={2}
            maxLength={50}
            placeholder="Ex.: educação, varejo, saúde"
          />
        </label>
        <label>
          Quantidade de funcionários
          <select name="employees" required defaultValue="">
            <option value="" disabled>
              Selecione uma faixa
            </option>
            {employeeRanges.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Investe ou já investiu em marketing?
          <select name="marketing" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            <option>Sim</option>
            <option>Não</option>
          </select>
        </label>
        <label className="full">
          Possui Social Media ou marketing internamente?
          <select name="team" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            <option>Sim</option>
            <option>Não</option>
            <option>Profissional terceirizado</option>
          </select>
        </label>
        <label className="full">
          Qual é sua principal dificuldade com conteúdo?
          <select name="difficulty" required defaultValue="">
            <option value="" disabled>
              O que mais precisa mudar hoje?
            </option>
            {difficulties.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="honeypot" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="consent">
        <input type="checkbox" name="consent" required />
        <span>
          Autorizo o uso destes dados para receber contato sobre o Gênio em Redes Sociais, conforme
          as <a href="#privacidade">informações de privacidade</a>.
        </span>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button form-submit" disabled={busy}>
        {busy ? 'Registrando seus dados…' : 'Conversar sobre a minha empresa'}
        <ArrowRight size={19} />
      </button>
      <small className="form-note">
        Seus dados são registrados antes de abrir o WhatsApp. Sem compromisso.
      </small>
    </form>
  );
}
