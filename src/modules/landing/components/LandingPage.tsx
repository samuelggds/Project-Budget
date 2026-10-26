import { useEffect, useState } from 'react'
import './landing.css'

const whatsappNumber = '5585989323113'

function whatsappLink(message: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`
}

const contactLink = whatsappLink(
  'Olá! Conheci a MG Refrigerações pelo site e gostaria de solicitar um orçamento para refrigeração de baú de caminhão.',
)

type IconName = 'snow' | 'wrench' | 'shield' | 'truck' | 'arrow' | 'phone' | 'menu' | 'close' | 'check' | 'location' | 'mail'

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === 'snow' && (
        <>
          <path d="M12 2v20M4 6l16 12M20 6 4 18" />
          <path d="m9 5 3-3 3 3M9 19l3 3 3-3M3.7 10l.7-4.1 4.2.9M15.4 17.2l4.2.9.7-4.1M3.7 14l.7 4.1 4.2-.9M15.4 6.8l4.2-.9.7 4.1" />
        </>
      )}
      {name === 'wrench' && (
        <>
          <path d="M14.5 6.3a5 5 0 0 0-6.2 6.2L3.7 16.9a2 2 0 0 0 2.8 2.8l4.6-4.6a5 5 0 0 0 6.2-6.2l-3.4 3.4-3.2-.8-.8-3.2 3.4-3.4Z" />
        </>
      )}
      {name === 'shield' && (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </>
      )}
      {name === 'truck' && (
        <>
          <path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z" />
          <circle cx="7.5" cy="18" r="2" />
          <circle cx="17.5" cy="18" r="2" />
          <path d="M5 9h7M5 12h7" />
        </>
      )}
      {name === 'arrow' && <path d="M5 12h14m-7-7 7 7-7 7" />}
      {name === 'phone' && (
        <path d="M21 16.4v3a2 2 0 0 1-2.2 2 18 18 0 0 1-7.9-2.8 18 18 0 0 1-5.5-5.5A18 18 0 0 1 2.6 5.2 2 2 0 0 1 4.6 3h3a2 2 0 0 1 2 1.7c.12.98.36 1.94.7 2.85a2 2 0 0 1-.45 2.1L8.6 10.9a14 14 0 0 0 4.5 4.5l1.25-1.25a2 2 0 0 1 2.1-.45c.91.34 1.87.58 2.85.7A2 2 0 0 1 21 16.4Z" />
      )}
      {name === 'menu' && <path d="M4 7h16M4 12h16M4 17h16" />}
      {name === 'close' && <path d="M5 5l14 14M19 5 5 19" />}
      {name === 'check' && <path d="m5 12 4 4L19 6" />}
      {name === 'location' && (
        <>
          <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      )}
      {name === 'mail' && (
        <>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m2 6 10 8 10-8" />
        </>
      )}
    </svg>
  )
}

const services: Array<{ icon: IconName; number: string; title: string; description: string }> = [
  {
    icon: 'snow',
    number: '01',
    title: 'Refrigeração de baús',
    description: 'Atendimento voltado aos sistemas de refrigeração de baús de caminhões utilizados no transporte de cargas refrigeradas.',
  },
  {
    icon: 'wrench',
    number: '02',
    title: 'Manutenção preventiva',
    description: 'Avaliação de componentes e condições de funcionamento para ajudar sua operação a se antecipar a possíveis falhas.',
  },
  {
    icon: 'shield',
    number: '03',
    title: 'Manutenção corretiva',
    description: 'Análise de problemas no equipamento frigorífico e orientação sobre as intervenções necessárias.',
  },
  {
    icon: 'truck',
    number: '04',
    title: 'Soluções para frotas',
    description: 'Converse com nossa equipe sobre as necessidades dos veículos refrigerados da sua empresa.',
  },
]

const markets = [
  { number: '01', title: 'Transportadoras', text: 'Para empresas que dependem de veículos refrigerados na rotina de entregas.' },
  { number: '02', title: 'Distribuidores', text: 'Para operações que transportam alimentos e outras mercadorias com exigência térmica.' },
  { number: '03', title: 'Frotas empresariais', text: 'Para negócios que precisam cuidar dos equipamentos de refrigeração de seus caminhões.' },
]

const navLinks = [
  { href: '#inicio', label: 'Início' },
  { href: '#servicos', label: 'Serviços' },
  { href: '#empresas', label: 'Para empresas' },
  { href: '#contato', label: 'Contato' },
]

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>('.mg-landing .mg-reveal');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((target) => target.classList.add('mg-reveal-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('mg-reveal-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -25px 0px' });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);


  return (
    <div className="mg-landing" id="inicio">
      <a className="mg-skip-link" href="#conteudo">Pular para o conteúdo</a>

      <header className="mg-header">
        <div className="mg-container mg-header-inner">
          <a href="#inicio" className="mg-brand" aria-label="MG Refrigerações, início" onClick={() => setMenuOpen(false)}>
            <span className="mg-brand-mark"><img src="/MG_icon.png" alt="Logo oficial da MG Refrigeração" /></span>
            <span className="mg-brand-name"><strong>MG Refrigerações</strong><small>Soluções para transporte refrigerado</small></span>
          </a>

          <button
            className="mg-mobile-toggle"
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-controls="mg-public-nav"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={26} />
          </button>

          <nav id="mg-public-nav" className={`mg-nav ${menuOpen ? 'mg-nav-open' : ''}`} aria-label="Navegação principal">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>
            ))}
            <a className="mg-nav-cta" href={contactLink} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
              Solicitar orçamento <Icon name="arrow" size={17} />
            </a>
          </nav>
        </div>
      </header>

      <main id="conteudo">
        <section className="mg-hero" aria-labelledby="mg-hero-title">
          <div className="mg-hero-glow" aria-hidden="true" />
          <div className="mg-container mg-hero-grid">
            <div className="mg-hero-content mg-hero-entrance">
              <span className="mg-eyebrow mg-eyebrow-light"><span className="mg-eyebrow-dot" /> ESPECIALISTAS EM TRANSPORTE REFRIGERADO</span>
              <h1 id="mg-hero-title">Sua carga precisa de frio. <span>Seu caminhão, de confiança.</span></h1>
              <p className="mg-hero-description">Soluções em refrigeração para baús de caminhões. A MG Refrigerações atende empresas que precisam cuidar dos equipamentos frigoríficos e manter sua operação preparada para a estrada.</p>
              <div className="mg-hero-actions">
                <a className="mg-btn mg-btn-whatsapp" href={contactLink} target="_blank" rel="noopener noreferrer"><Icon name="phone" size={20} /> Solicitar orçamento <Icon name="arrow" size={18} /></a>
                <a className="mg-btn mg-btn-outline" href="#servicos">Conhecer serviços <Icon name="arrow" size={18} /></a>
              </div>
              <div className="mg-hero-proof">
                <span><Icon name="check" size={17} /> Atendimento empresarial</span>
                <span><Icon name="check" size={17} /> Foco em baús refrigerados</span>
              </div>
            </div>

            <div className="mg-hero-visual mg-hero-entrance mg-hero-entrance-delayed">
              <div className="mg-hero-photo">
                <img
                  src="/caminhao-mg-refrigeracoes.webp"
                  alt="Imagem ilustrativa de caminhão brasileiro refrigerado com a identidade visual MG Refrigerações"
                  decoding="async"
                  loading="eager"
                  width={1448}
                  height={1086}
                />
              </div>
              <div className="mg-hero-visual-badge"><span className="mg-badge-icon"><Icon name="snow" size={28} /></span><span><strong>Refrigeração em movimento</strong><small>O cuidado que acompanha sua carga.</small></span></div>
              <span className="mg-photo-note">Imagem ilustrativa criada digitalmente · MG Refrigerações</span>
            </div>
          </div>
          <div className="mg-hero-bottom-line" />
        </section>

        <section className="mg-intro-strip" aria-label="Apresentação da empresa">
          <div className="mg-container mg-intro-inner">
            <p><strong>Refrigeração para quem move o Brasil.</strong> Soluções técnicas para quem trabalha com transporte de cargas refrigeradas.</p>
            <span>MG REFRIGERAÇÕES <span aria-hidden="true">✳</span> FORTALEZA · CE</span>
          </div>
        </section>

        <section className="mg-section mg-services" id="servicos" aria-labelledby="mg-services-title">
          <div className="mg-container">
            <div className="mg-section-heading mg-reveal">
              <div>
                <span className="mg-eyebrow">NOSSAS SOLUÇÕES</span>
                <h2 id="mg-services-title">O suporte que a sua <span>operação precisa.</span></h2>
              </div>
              <p>Conheça as frentes de atendimento e fale com nossa equipe para avaliar a necessidade do seu veículo ou frota.</p>
            </div>
            <div className="mg-services-grid">
              {services.map((service) => (
                <article className="mg-service-card mg-reveal" key={service.number}>
                  <div className="mg-service-top"><span className="mg-service-icon"><Icon name={service.icon} size={29} /></span><span className="mg-service-number">{service.number}</span></div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <a href={whatsappLink(`Olá! Gostaria de saber mais sobre ${service.title.toLowerCase()} para caminhões.`)} target="_blank" rel="noopener noreferrer">
                    Consultar atendimento <Icon name="arrow" size={17} />
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mg-operation mg-section" aria-labelledby="mg-operation-title">
          <div className="mg-container mg-operation-grid">
            <div className="mg-operation-photo mg-reveal">
              <img
                src="https://images.unsplash.com/photo-1681514583222-0579e6835666?auto=format&fit=crop&w=1200&q=80"
                alt="Caminhão refrigerado em área de operações logísticas, imagem ilustrativa"
                loading="lazy"
                decoding="async"
              />
              <span>Imagem ilustrativa · MealPro / Unsplash</span>
            </div>
            <div className="mg-operation-content mg-reveal">
              <span className="mg-eyebrow">POR QUE FALAR COM A MG?</span>
              <h2 id="mg-operation-title">A refrigeração é parte essencial da sua entrega.</h2>
              <p>Quando a operação depende de temperatura controlada, acompanhar as condições do equipamento frigorífico faz parte do cuidado com o transporte.</p>
              <ul className="mg-check-list">
                <li><Icon name="check" size={20} /><span>Atendimento direcionado às necessidades do seu caminhão.</span></li>
                <li><Icon name="check" size={20} /><span>Orientação para avaliação e manutenção do sistema.</span></li>
                <li><Icon name="check" size={20} /><span>Contato direto para explicar sua demanda e solicitar orçamento.</span></li>
              </ul>
              <a className="mg-text-link" href={contactLink} target="_blank" rel="noopener noreferrer">Conversar com a equipe <Icon name="arrow" size={19} /></a>
            </div>
          </div>
        </section>

        <section className="mg-section mg-markets" id="empresas" aria-labelledby="mg-markets-title">
          <div className="mg-container">
            <div className="mg-markets-header mg-reveal">
              <span className="mg-eyebrow">PARA QUEM TRABALHAMOS</span>
              <h2 id="mg-markets-title">Seu negócio transporta cargas refrigeradas? <span>Podemos conversar.</span></h2>
              <p>Atendimento pensado para empresas que utilizam baús refrigerados no transporte e na distribuição de mercadorias.</p>
            </div>
            <div className="mg-markets-grid">
              {markets.map((market) => (
                <article className="mg-market mg-reveal" key={market.number}>
                  <span>{market.number}</span>
                  <h3>{market.title}</h3>
                  <p>{market.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mg-section mg-steps" aria-labelledby="mg-steps-title">
          <div className="mg-container">
            <div className="mg-steps-heading mg-reveal"><span className="mg-eyebrow">CONTATO SIMPLES E DIRETO</span><h2 id="mg-steps-title">Como solicitar um atendimento</h2></div>
            <div className="mg-steps-grid">
              <div><strong>01</strong><h3>Conte o que precisa</h3><p>Entre em contato e explique a necessidade do caminhão ou da frota.</p></div>
              <div><strong>02</strong><h3>Compartilhe os detalhes</h3><p>Informe o modelo do equipamento, os sintomas ou o serviço desejado.</p></div>
              <div><strong>03</strong><h3>Alinhe seu orçamento</h3><p>Nossa equipe orienta sobre os próximos passos e a disponibilidade de atendimento.</p></div>
            </div>
          </div>
        </section>

        <section className="mg-cta-section" id="contato" aria-labelledby="mg-contact-title">
          <div className="mg-container">
            <div className="mg-cta-panel mg-reveal">
              <div className="mg-cta-decor" aria-hidden="true"><Icon name="snow" size={180} /></div>
              <div className="mg-cta-text">
                <span className="mg-eyebrow mg-eyebrow-light">VAMOS CONVERSAR?</span>
                <h2 id="mg-contact-title">Sua frota merece atenção especializada.</h2>
                <p>Entre em contato com a MG Refrigerações e solicite informações sobre o serviço ideal para o seu caminhão.</p>
              </div>
              <div className="mg-cta-action"><a href={contactLink} target="_blank" rel="noopener noreferrer" className="mg-btn mg-btn-whatsapp"><Icon name="phone" size={21} /> Chamar no WhatsApp <Icon name="arrow" size={18} /></a><small>(85) 98932-3113</small></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mg-footer">
        <div className="mg-container mg-footer-grid">
          <div className="mg-footer-company">
            <a className="mg-brand" href="#inicio"><span className="mg-brand-mark"><img src="/MG_icon.png" alt="Logo da MG Refrigeração" /></span><span className="mg-brand-name"><strong>MG Refrigerações</strong><small>Refrigeração para transporte</small></span></a>
            <p>Soluções em refrigeração de baús de caminhões para empresas que dependem do transporte refrigerado.</p>
          </div>
          <div className="mg-footer-col">
            <h3>Explore</h3>
            <a href="#servicos">Nossos serviços</a>
            <a href="#empresas">Para empresas</a>
            <a href="#contato">Fale conosco</a>
            <a href="/admin">Acesso administrativo</a>
          </div>
          <div className="mg-footer-col">
            <h3>Contato</h3>
            <a href={contactLink} target="_blank" rel="noopener noreferrer"><Icon name="phone" size={17} /> (85) 98932-3113</a>
            <a href="mailto:contato@mgrefrigeracoes.com.br"><Icon name="mail" size={17} /> contato@mgrefrigeracoes.com.br</a>
            <span><Icon name="location" size={17} /> Fortaleza, Ceará</span>
          </div>
        </div>
        <div className="mg-container mg-footer-bottom"><span>© {new Date().getFullYear()} MG Refrigerações · CNPJ 31.263.081/0001-46</span><span>Rua Francisco Calaça, 1688 · Fortaleza/CE</span></div>
      </footer>

      <a className="mg-floating-whatsapp" href={contactLink} target="_blank" rel="noopener noreferrer" aria-label="Solicitar orçamento pelo WhatsApp" title="Fale com a MG Refrigerações">
        <Icon name="phone" size={26} />
      </a>
    </div>
  )
}
