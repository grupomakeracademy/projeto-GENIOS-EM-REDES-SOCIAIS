import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Fingerprint,
  Layers3,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import {
  Header,
  Mark,
  ScrollStory,
  BrandJourney,
  Autonomy,
  LeadForm,
} from '../components/experience';
import { faqs, testimonials } from '../lib/content';
import { CardMotion } from '../components/card-motion';
import { HeroDemo, ProductReveal, Testimonials } from '../components/product-experience';

export default function Page() {
  const login = process.env.PRIVATE_LOGIN_URL || 'http://127.0.0.1:3001/login';
  return (
    <>
      <CardMotion />
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>
      <Header login={login} />
      <main id="conteudo">
        <section className="hero" id="inicio">
          <div className="hero-inner">
            <div className="hero-copy">
              <h1>
                Sua marca tem
                <br />
                uma história.
                <br />
                <span>
                  Dê inteligência
                  <br />a ela.
                </span>
              </h1>
              <p>
                Um Gênio que conhece seu negócio e conecta estratégia, identidade e memória à
                criação de conteúdo.
              </p>
              <a className="button" href="#conversa">
                Quero começar <ArrowRight size={19} />
              </a>
              <a className="hero-secondary" href="#inteligencia">
                Conheça uma nova forma de criar <span>↓</span>
              </a>
            </div>
            <HeroDemo />
          </div>
          <div className="hero-baseline">
            <span>Uma inteligência especializada na sua empresa.</span>
            <span>
              Do contexto à criação <ArrowRight size={15} /> Com você no controle.
            </span>
          </div>
        </section>
        <section className="problem section" id="inteligencia">
          <div className="problem-copy">
            <h2>
              Muita coisa para postar.
              <br />
              <span>Pouca conexão entre elas.</span>
            </h2>
            <p>
              A ideia fica na conversa. O briefing, em outro arquivo. O visual muda. O prazo chega.
              E sua equipe precisa começar de novo.
            </p>
            <p>
              O custo do improviso aparece no tempo de revisão, na falta de constância e em uma
              marca que nem sempre se reconhece no próprio conteúdo.
            </p>
            <a className="text-link" href="#conversa">
              Quero entender uma forma diferente <ArrowRight size={17} />
            </a>
          </div>
          <ScrollStory />
        </section>
        <section className="turn section">
          <span className="turn-line" />
          <h2>
            E se cada conteúdo
            <br />
            começasse com <em>contexto?</em>
          </h2>
          <p>
            Conheça o Gênio em Redes Sociais. Uma inteligência agêntica especializada: ela reúne o
            que importa sobre sua empresa para orientar o planejamento e a criação, com
            continuidade.
          </p>
          <div className="turn-principles">
            <span>
              <Fingerprint />
              Conhece sua marca
            </span>
            <span>
              <MessageSquare />
              Respeita sua voz
            </span>
            <span>
              <Layers3 />
              Conecta seu histórico
            </span>
          </div>
        </section>
        <section className="personalization section" id="sua-marca">
          <div className="section-intro">
            <h2>
              Antes de criar para você,
              <br />
              ele precisa <span>conhecer você.</span>
            </h2>
            <p>Um Gênio ganha forma com o que torna a sua empresa única.</p>
          </div>
          <BrandJourney />
        </section>
        <ProductReveal kind="creation" />
        <section className="memory section">
          <div>
            <h2>
              Seu próximo conteúdo
              <br />
              não começa do zero.
            </h2>
            <p>
              O que já foi criado vira contexto para o que vem depois. A memória editorial ajuda a
              manter a linha da marca e a reduzir a repetição de temas.
            </p>
            <p>Cada Gênio tem sua própria memória. Marcas diferentes, histórias independentes.</p>
          </div>
          <div className="memory-timeline">
            <div>
              <span>Ontem</span>
              <strong>A história da sua marca</strong>
              <p>Uma ideia apresentada.</p>
            </div>
            <div>
              <span>Hoje</span>
              <strong>Um novo ponto de vista</strong>
              <p>Contexto que se acumula.</p>
            </div>
            <div className="memory-next">
              <span>A seguir</span>
              <strong>
                Continuidade, com novas ideias <ArrowUpRight size={18} />
              </strong>
              <p>Seu histórico orienta a próxima criação.</p>
            </div>
            <small>Exemplo ilustrativo de continuidade editorial.</small>
          </div>
        </section>
        <section className="purpose section">
          <h2>
            O conteúdo ganha direção.
            <br />
            <span>A direção vem do seu negócio.</span>
          </h2>
          <div className="purpose-rows">
            {[
              [
                '01',
                'Posicionamento',
                'Uma presença que traduz quem você é.',
                'Construa percepção de marca, identidade e autoridade com uma comunicação alinhada.',
              ],
              [
                '02',
                'Crescimento',
                'Consistência para continuar presente.',
                'Organize a produção para ampliar sua presença e conversar com sua audiência de forma recorrente.',
              ],
              [
                '03',
                'Vendas',
                'Sua oferta, em uma história relevante.',
                'Direcione conteúdos à apresentação de produtos, geração de demanda e conversas comerciais.',
              ],
            ].map(([n, title, sub, text]) => (
              <article key={title}>
                <span>{n}</span>
                <h3>{title}</h3>
                <div>
                  <strong>{sub}</strong>
                  <p>{text}</p>
                </div>
                <ArrowUpRight />
              </article>
            ))}
          </div>
          <small>
            Objetivos que orientam a criação. Resultados dependem da estratégia, do mercado e da
            operação de cada empresa.
          </small>
        </section>
        <section className="autonomy section" id="autonomia">
          <div className="section-intro">
            <h2>
              Mais capacidade.
              <br />
              <span>O controle continua seu.</span>
            </h2>
            <p>
              Defina a rotina, estabeleça as regras e escolha como sua equipe participa. Explore os
              dois cenários.
            </p>
          </div>
          <Autonomy />
          <a className="text-link" href="#conversa">
            Quero entender como funcionaria <ArrowRight size={17} />
          </a>
        </section>
        <ProductReveal kind="planning" />
        <section className="audience section">
          <div>
            <h2>
              Uma operação que cabe
              <br />
              na sua realidade.
            </h2>
            <p>
              Da empresa que precisa estruturar sua presença à equipe que já cria todos os dias.
            </p>
            <a className="button outline" href="#conversa">
              Conhecer a solução para minha empresa <ArrowRight size={18} />
            </a>
          </div>
          <div className="audience-list">
            {[
              [
                'Você cuida de quase tudo',
                'Ganhe uma estrutura para tirar a criação de conteúdo do improviso.',
              ],
              [
                'Seu Social Media precisa de capacidade',
                'Some planejamento, contexto e produção ao trabalho de quem já conhece a marca.',
              ],
              [
                'Sua equipe opera várias marcas',
                'Mantenha briefings, conteúdos, canais e memórias separados por Gênio.',
              ],
            ].map(([title, text]) => (
              <article key={title}>
                <Check size={20} />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="method section">
          <h2>
            Da primeira conversa
            <br />à sua próxima criação.
          </h2>
          <ol>
            {[
              ['Conte seu cenário', 'O especialista entende seu negócio e sua necessidade.'],
              ['Dê contexto ao Gênio', 'Defina briefing, voz, identidade e referências.'],
              ['Escolha sua direção', 'Organize objetivos, canais, rotina e aprovação.'],
              [
                'Crie com continuidade',
                'Planeje, revise e exporte. O histórico acompanha as próximas produções.',
              ],
            ].map(([t, d]) => (
              <li key={t}>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="trust section">
          <ShieldCheck size={32} />
          <h2>
            Confiança se constrói
            <br />
            vendo como funciona.
          </h2>
          <p>
            Na conversa, conheça o fluxo de briefing, criação e revisão. Entenda as capacidades
            disponíveis e avalie como elas se encaixam na sua operação.
          </p>
          <a className="text-link" href="#conversa">
            Quero conhecer o Gênio na prática <ArrowRight size={17} />
          </a>
        </section>
        <Testimonials items={testimonials} />
        <section className="faq section" id="duvidas">
          <div>
            <h2>
              Antes de dar
              <br />o próximo passo.
            </h2>
            <p>Respostas claras para uma decisão com contexto.</p>
          </div>
          <div>
            {faqs.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <span>+</span>
                </summary>
                <p>
                  {a}
                  {q === 'Quanto custa?' && (
                    <>
                      {' '}
                      <a href="#conversa">Conversar sobre minha empresa →</a>
                    </>
                  )}
                </p>
              </details>
            ))}
          </div>
        </section>
        <section className="conversion section" id="conversa">
          <div className="conversion-copy">
            <Mark small />
            <h2>
              A próxima história
              <br />
              pode ser <span>a sua.</span>
            </h2>
            <p>
              Conte um pouco sobre sua empresa. Um especialista vai ajudar você a entender como o
              Gênio pode fazer parte da sua operação.
            </p>
            <div className="conversion-steps">
              <span>
                01 <strong>Você conta seu cenário</strong>
              </span>
              <span>
                02 <strong>Nós entendemos sua necessidade</strong>
              </span>
              <span>
                03 <strong>A conversa continua no WhatsApp</strong>
              </span>
            </div>
          </div>
          <LeadForm />
        </section>
      </main>
      <footer className="footer">
        <div className="footer-top">
          <a className="brand" href="#inicio">
            <Mark small />
            <span>
              gênio<span>em redes sociais</span>
            </span>
          </a>
          <p>
            Inteligência que começa
            <br />
            com a sua identidade.
          </p>
          <nav aria-label="Navegação do rodapé">
            <a href="#inteligencia">A solução</a>
            <a href="#sua-marca">Seu Gênio</a>
            <a href="#autonomia">Autonomia</a>
            <a href="#duvidas">Dúvidas</a>
            <a href="#conversa">Contato / WhatsApp</a>
            <a href={login}>Já sou assinante ↗</a>
          </nav>
        </div>
        <details id="privacidade">
          <summary>Privacidade e uso dos seus dados</summary>
          <p>
            A Maker Academy utiliza os dados deste formulário para qualificar seu interesse e entrar
            em contato sobre o Gênio em Redes Sociais. Os dados são registrados no Supabase antes da
            abertura do WhatsApp. Ao continuar, as informações do formulário compõem uma mensagem
            que você pode revisar antes de enviar. O WhatsApp trata os dados conforme suas próprias
            políticas. Para solicitar acesso, correção, exclusão ou revogar a autorização de
            contato, fale com a Maker Academy pelo{' '}
            <a href="https://wa.me/5519988788759">WhatsApp (19) 98878-8759</a>. Este site não
            utiliza cookies de publicidade nem exige cadastro para conhecer a solução.
          </p>
        </details>
        <div className="footer-bottom">
          <span>© 2026 Maker Academy. Todos os direitos reservados</span>
          <a href="#inicio">Voltar ao início ↑</a>
        </div>
      </footer>
    </>
  );
}
