'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, ArrowUpRight, Search, Check, Maximize2, X } from 'lucide-react';
import { Mark } from './experience';

function Network({ name }: { name: string }) {
  return (
    <span className={`network-logo network-${name.toLowerCase()}`} aria-label={name}>
      {name === 'Instagram' ? (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
          <circle cx="17" cy="7" r="1" fill="currentColor" />
        </svg>
      ) : name === 'Facebook' ? (
        'f'
      ) : name === 'LinkedIn' ? (
        'in'
      ) : name === 'TikTok' ? (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 3h3c0 3 2 5 5 5v3a9 9 0 0 1-5-2v8a6 6 0 1 1-6-6v3a3 3 0 1 0 3 3V3Z" />
        </svg>
      ) : (
        '𝕏'
      )}
    </span>
  );
}

export function HeroDemo() {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    const observer = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (root.current) observer.observe(root.current);
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, 2200);
    return () => clearInterval(timer);
  }, [paused, reduced, visible]);
  const stage = reduced ? 2 : tick % 4;
  const post = Math.floor(tick / 4) % 3;
  const titles = [
    'Aprender com autonomia',
    'Uma jornada de descobertas',
    'Conhecimento que aproxima',
  ];
  return (
    <div
      ref={root}
      className={`hero-demo demo-stage-${stage} ${paused || reduced || !visible ? 'demo-paused' : ''}`}
    >
      <div className="demo-top">
        <span>
          <i /> O Gênio da sua marca
        </span>
        <button
          onClick={() => setPaused(!paused)}
          aria-label={paused ? 'Retomar demonstração' : 'Pausar demonstração'}
          disabled={reduced}
        >
          {paused || reduced ? <Play size={15} /> : <Pause size={15} />}
        </button>
      </div>
      <div className="demo-engine">
        <div className="engine-core">
          <Mark />
        </div>
        <span>Seu agente</span>
        <div className="engine-context">
          <Search size={15} />
          <span>
            {
              [
                'Iniciando a criação',
                'Analisando o contexto',
                'Criando com sua identidade',
                'Conteúdo para suas redes',
              ][stage]
            }
          </span>
        </div>
      </div>
      <svg
        className="demo-connections"
        viewBox="0 0 600 520"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="connection-input" d="M140 155 C140 240 300 165 300 230" />
        <path
          className="connection-output"
          d="M300 370 C300 440 100 395 100 465 M300 370 C300 440 200 395 200 465 M300 370 V465 M300 370 C300 440 400 395 400 465 M300 370 C300 440 500 395 500 465"
        />
      </svg>
      <div className="demo-post">
        <div className="demo-post-heading">
          <Network name="Instagram" />
          <span>Conteúdo com a sua identidade</span>
          <ArrowUpRight size={15} />
        </div>
        <div className="demo-post-body">
          <div className="post-art">
            {[0, 1, 2].map((i) => (
              <img
                key={i}
                src={`/product/post-${i + 1}.webp`}
                alt={i === post ? 'Exemplo real de arte criada no Gênios' : ''}
                className={i === post ? 'active' : ''}
                width="240"
                height="360"
              />
            ))}
            <span className="scan-line" />
          </div>
          <div className="post-context">
            <span className="mini-brand">Sua marca, presente.</span>
            <h3>{titles[post]}</h3>
            <p>Contexto, comunicação e identidade na mesma criação.</p>
            <span className="post-ready">
              <Check size={13} /> {stage >= 2 ? 'Conteúdo criado' : 'Conectando referências'}
            </span>
          </div>
        </div>
      </div>
      <div className="demo-networks">
        {['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'X'].map((name) => (
          <div key={name}>
            <Network name={name} />
            <small>{name}</small>
          </div>
        ))}
      </div>
      <div className="demo-caption">Demonstração ilustrativa com conteúdos reais</div>
    </div>
  );
}

export function ProductReveal({ kind }: { kind: 'creation' | 'planning' }) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const screens =
    kind === 'creation'
      ? [
          {
            id: 'list',
            title: 'Conhecer é apenas o começo.',
            text: 'O contexto ganha forma em conteúdos reais. Sua produção, organizada em uma única visão.',
            label: 'Conteúdos em Lista',
          },
          {
            id: 'kanban',
            title: 'Cada conteúdo tem seu próximo passo.',
            text: 'Da rotina à revisão e à aprovação. Acompanhe a operação sem perder o contexto.',
            label: 'Operação em Kanban',
          },
        ]
      : [
          {
            id: 'routine',
            title: 'Você define o ritmo.',
            text: 'Dias, horários e nível de independência. A rotina nasce das decisões da sua empresa.',
            label: 'Rotina do agente',
          },
          {
            id: 'calendar',
            title: 'E a operação continua.',
            text: 'O planejamento aparece no calendário. Conteúdos e horários ganham uma visão clara do que vem a seguir.',
            label: 'Calendário de conteúdos',
          },
        ];
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const range = Math.max(1, rect.height - innerHeight);
      const progress = Math.max(0, Math.min(1, -rect.top / range));
      node.style.setProperty(
        '--reveal',
        String(media.matches || innerWidth < 761 ? 1 : Math.min(1, progress * 3)),
      );
      if (innerWidth >= 761 && !media.matches) setActive(progress > 0.53 ? 1 : 0);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener('scroll', scroll, { passive: true });
    addEventListener('resize', scroll);
    media.addEventListener('change', scroll);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', scroll);
      removeEventListener('resize', scroll);
      media.removeEventListener('change', scroll);
    };
  }, []);
  return (
    <section
      ref={root}
      className={`product-reveal product-${kind}`}
      aria-label={kind === 'creation' ? 'A plataforma real' : 'Planejamento na plataforma'}
    >
      <div className="product-pin">
        <div className="product-heading">
          {kind === 'creation' && (
            <span className="reveal-origin">
              <Mark small />
              Agora ele conhece sua marca.
            </span>
          )}
          <h2>{screens[active].title}</h2>
          <p>{screens[active].text}</p>
        </div>
        <div className="product-stage">
          <div className="product-toolbar">
            <div role="group" aria-label="Visualização da plataforma">
              {screens.map((s, i) => (
                <button key={s.id} aria-pressed={active === i} onClick={() => setActive(i)}>
                  {s.label}
                </button>
              ))}
            </div>
            <button
              className="expand-product"
              onClick={() => dialog.current?.showModal()}
              aria-label="Ampliar tela real"
            >
              <Maximize2 size={17} />
            </button>
          </div>
          <div className="product-screen">
            {screens.map((s, i) => (
              <img
                key={s.id}
                src={`/product/${s.id}.webp`}
                alt={i === active ? `Tela real do Gênios: ${s.label}` : ''}
                aria-hidden={i !== active}
                className={i === active ? 'active' : ''}
                width="1920"
                height="1070"
                loading="lazy"
              />
            ))}
            <span
              className={`screen-spotlight spotlight-${screens[active].id}`}
              aria-hidden="true"
            />
          </div>
        </div>
        <small className="product-footnote">
          Capturas reais da plataforma · explore as telas ou continue a rolagem
        </small>
      </div>
      <dialog ref={dialog} className="product-dialog">
        <button onClick={() => dialog.current?.close()} aria-label="Fechar tela ampliada">
          <X />
        </button>
        <img
          src={`/product/${screens[active].id}.webp`}
          alt={`Tela ampliada: ${screens[active].label}`}
        />
        <p>{screens[active].label} · captura real da plataforma</p>
      </dialog>
    </section>
  );
}

export type Testimonial = {
  name: string;
  role: string;
  quote: string;
  company?: string;
  photo?: string;
};
export function Testimonials({ items }: { items: Testimonial[] }) {
  const [paused, setPaused] = useState(false);
  if (!items.length) return null;
  return (
    <section className={`testimonial-section ${paused ? 'is-paused' : ''}`}>
      <h2>Aprovada por quem usa</h2>
      <p>
        Descubra como o Gênios em Redes Sociais transforma a rotina de criação, organização e gestão
        de conteúdo de quem usa.
      </p>
      <button className="testimonial-pause" onClick={() => setPaused(!paused)}>
        {paused ? 'Retomar depoimentos' : 'Pausar depoimentos'}
      </button>
      <div className="testimonial-window">
        <div className={`testimonial-track ${items.length < 4 ? 'few-items' : ''}`}>
          {[0, 1].map((copy) => (
            <div className="testimonial-group" key={copy} aria-hidden={copy === 1}>
              {items.map((t) => (
                <figure key={t.name}>
                  <figcaption>
                    {t.photo && <img src={t.photo} alt="" width="48" height="48" loading="lazy" />}
                    <div>
                      <strong>{t.name}</strong>
                      <span>
                        {t.role}
                        {t.company ? ` · ${t.company}` : ''}
                      </span>
                    </div>
                  </figcaption>
                  <blockquote>{t.quote}</blockquote>
                </figure>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
