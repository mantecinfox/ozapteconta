import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';

/**
 * Design Philosophy: OZAPTECHAMA - Gatilhos Mentais Poderosos
 * - Paleta: Azul Escuro (#0F172A), Branco, Cinza (#6B7280), Preto
 * - Foco em: Urgência, Escassez, Prova Social, FOMO, Transformação
 * - Elementos: Contadores, Números grandes, Badges, Depoimentos reais
 */

const TAGLINE_SHORT = 'Finanças, nutrição, comercial e mais';
const TAGLINE =
  'Finanças, nutrição, comercial, mercado financeiro e muito mais — direto no WhatsApp';
const TAGLINE_FOOTER =
  'Assistente para finanças, nutrição, comercial, mercado financeiro e muito mais, direto no WhatsApp.';

export default function Home() {
  const [email, setEmail] = useState('');
  const [activeUsers, setActiveUsers] = useState(187);
  const [totalSavings, setTotalSavings] = useState(86000);
  const [spotsLeft, setSpotsLeft] = useState(42);
  const whatsappNumber = '553173124224';
  const whatsappMessage = 'Olá! Quero começar a usar o OZAPTECHAMA pelo WhatsApp.';
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
  const whatsappQrCode = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(whatsappLink)}`;

  useEffect(() => {
    // Simular contadores ao vivo
    const interval = setInterval(() => {
      setActiveUsers(prev => prev + Math.floor(Math.random() * 2));
      setTotalSavings(prev => prev + Math.floor(Math.random() * 180));
      setSpotsLeft(prev => (prev > 18 ? prev - 1 : 42));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Header: ícone + texto num único bloco (não usar logo-ozaptechama.svg — corta o nome) */}
      <header className="sticky top-0 z-50 border-b-4 border-green-500 bg-white shadow-md">
        <div className="container mx-auto flex h-16 items-center justify-center gap-4 px-4 md:justify-between">
          <a
            href="/"
            className="flex max-w-full items-center gap-3"
            aria-label="OZAPTECHAMA - início"
          >
            <img
              src="/logo-icon.svg?v=4"
              alt=""
              width={44}
              height={44}
              className="size-11 shrink-0"
              decoding="async"
            />
            <div className="min-w-0 leading-tight">
              <p className="text-base font-extrabold tracking-tight text-gray-900 sm:text-lg">
                OZAPTECHAMA
              </p>
              <p className="text-xs font-medium text-green-600">
                {TAGLINE_SHORT}
              </p>
            </div>
          </a>

          <div className="hidden shrink-0 items-center gap-3 md:flex">
            <span className="rounded-full border border-green-300 bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
              PIX OU CARTÃO
            </span>
            <Button className="bg-green-500 font-bold text-white hover:bg-green-600">
              VER PLANOS
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section com Gatilhos */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-900 to-blue-800 text-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="inline-block bg-green-500 text-black px-4 py-2 rounded-full font-bold text-sm">
                  PLANOS ACESSÍVEIS • PIX OU CARTÃO • 100% BRASILEIRO
                </div>
                <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                  OZAPTECHAMA
                </h1>
                <p className="text-xl text-green-300 font-bold sm:text-2xl">
                  {TAGLINE}
                </p>
              </div>

              <div className="space-y-4 bg-blue-800/90 p-6 rounded-2xl border border-green-400 shadow-2xl">
                <p className="text-lg">✅ Finanças, gastos, metas e investimentos pelo WhatsApp</p>
                <p className="text-lg">✅ Apoio nutricional e orientação comercial no mesmo assistente</p>
                <p className="text-lg">✅ Plano Completo com FIPE, mercado financeiro e criptomoedas</p>
                <p className="text-lg">✅ Plano Padrão a partir de R$ 4,99/mês • Pix ou cartão</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <a href={whatsappLink} target="_blank" rel="noreferrer">
                  <Button 
                    size="lg" 
                    className="bg-green-500 hover:bg-green-600 text-black font-bold h-14 px-8 rounded-lg text-lg"
                  >
                    FALAR NO WHATSAPP <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </a>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="border-2 border-white text-white hover:bg-blue-700 font-bold h-14 px-8 rounded-lg text-lg"
                >
                  CONHECER RECURSOS
                </Button>
              </div>

              <p className="text-sm text-green-300 font-bold">
                ✨ A partir de R$ 4,99/mês • Pix ou cartão • Acesso imediato
              </p>
            </div>

            <div className="relative">
              <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-green-400/40 via-blue-500/20 to-transparent blur-2xl" />
              <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-blue-950/50 p-3 shadow-2xl">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2 text-xs font-bold text-green-200">
                  <span className="rounded-full bg-white/10 px-3 py-1">Assistente completo</span>
                  <span className="rounded-full bg-green-500 px-3 py-1 text-black">APP 100% brasileiro</span>
                </div>
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028484296/azDT7U6LLduZEjhZgggaQx/hero-zap-te-conta-PrnpHjUY8RJnzx3WugEQsz.webp"
                  alt="OZAPTECHAMA no WhatsApp"
                  className="h-auto w-full rounded-2xl object-contain"
                />
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold">
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-green-300">R$ 4,99</p>
                    <p className="text-white/70">Padrão</p>
                  </div>
                  <div className="rounded-xl bg-green-500 p-3 text-black">
                    <p>R$ 9,99</p>
                    <p className="text-black/70">Completo</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3">
                    <p className="text-green-300">Pix/cartão</p>
                    <p className="text-white/70">Ativação</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contadores ao Vivo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 text-center">
            <div className="bg-white/10 backdrop-blur text-white p-5 rounded-2xl border border-white/20">
              <p className="text-3xl">{activeUsers.toLocaleString()}</p>
              <p className="text-sm text-green-200">Usuários OZAPTECHAMA</p>
            </div>
            <div className="bg-white/10 backdrop-blur text-white p-5 rounded-2xl border border-white/20">
              <p className="text-3xl">R$ {totalSavings.toLocaleString('pt-BR')}</p>
              <p className="text-sm text-green-200">Em áreas organizadas</p>
            </div>
            <div className="bg-green-500 text-black p-5 rounded-2xl font-bold shadow-xl">
              <p className="text-3xl">{spotsLeft}</p>
              <p className="text-sm">Ativações disponíveis</p>
            </div>
          </div>

          <div className="mt-12 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center rounded-[2rem] border border-white/15 bg-white/10 p-6 md:p-8 shadow-2xl backdrop-blur">
            <div className="text-left space-y-4">
              <div className="inline-block rounded-full bg-green-500 px-4 py-2 text-sm font-bold text-black">
                ACESSO IMEDIATO PELO WHATSAPP
              </div>
              <h3 className="text-3xl md:text-4xl font-bold leading-tight">
                Escaneie o QR Code ou toque no botão para iniciar seu atendimento
              </h3>
              <p className="text-lg text-blue-100">
                O cliente cai direto no WhatsApp do sistema e já começa os primeiros contatos para uso do ozapteconta.
              </p>
              <div className="space-y-2 text-green-200 text-sm font-bold">
                <p>📱 Número oficial: +55 31 7312-4224</p>
                <p>⚡ Link rápido com mensagem pronta</p>
                <p>✅ Ideal para colocar no site, anúncio e material comercial</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <a href={whatsappLink} target="_blank" rel="noreferrer">
                  <Button size="lg" className="bg-green-500 hover:bg-green-600 text-black font-bold h-14 px-8 rounded-lg text-lg">
                    INICIAR NO WHATSAPP <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </a>
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-lg border-2 border-white px-6 py-4 text-lg font-bold text-white transition hover:bg-blue-700"
                >
                  ABRIR LINK DE ACESSO
                </a>
              </div>
            </div>

            <div className="mx-auto w-full max-w-sm rounded-[2rem] bg-white p-5 text-center text-black shadow-2xl">
              <img
                src={whatsappQrCode}
                alt="QR Code para iniciar conversa no WhatsApp do OZAPTECHAMA"
                className="mx-auto w-full max-w-[280px] rounded-2xl border-4 border-green-500 bg-white p-3"
              />
              <p className="mt-4 text-lg font-bold text-blue-900">Escaneie para falar agora</p>
              <p className="mt-2 text-sm text-gray-600">Se estiver no celular, toque no botão ao lado para abrir o WhatsApp automaticamente.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Antes x Depois — transformação */}
      <section className="bg-gradient-to-b from-white to-gray-50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <span className="mb-4 inline-block rounded-full bg-blue-900 px-4 py-1.5 text-sm font-bold text-white">
              SUA ROTINA PODE MUDAR HOJE
            </span>
            <h2 className="text-4xl font-bold leading-tight md:text-5xl">
              O que muda quando você tem um assistente completo no WhatsApp?
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Finanças, nutrição, comercial e mercado financeiro — tudo no mesmo lugar, sem app novo para instalar.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:gap-8">
            <div className="relative overflow-hidden rounded-2xl border-2 border-red-200 bg-red-50/80 p-8 shadow-lg">
              <div className="absolute right-0 top-0 rounded-bl-2xl bg-red-200 px-4 py-1 text-xs font-bold uppercase tracking-wide text-red-900">
                Sem assistente
              </div>
              <div className="mb-5 text-5xl">😰</div>
              <h3 className="text-2xl font-bold text-red-900">ANTES — Sem OZAPTECHAMA</h3>
              <p className="mb-6 mt-2 text-red-800/90">
                Você resolve tudo sozinho, em vários apps, sem resposta na hora.
              </p>
              <ul className="space-y-4">
                <li className="flex gap-3 text-red-900">
                  <span className="shrink-0 text-lg" aria-hidden>❌</span>
                  <span><strong className="font-semibold">Finanças:</strong> dinheiro entra e some, dívidas aumentam e não há metas claras.</span>
                </li>
                <li className="flex gap-3 text-red-900">
                  <span className="shrink-0 text-lg" aria-hidden>❌</span>
                  <span><strong className="font-semibold">Nutrição:</strong> alimentação no improviso, sem orientação prática no dia a dia.</span>
                </li>
                <li className="flex gap-3 text-red-900">
                  <span className="shrink-0 text-lg" aria-hidden>❌</span>
                  <span><strong className="font-semibold">Comercial:</strong> vendas e negócio sem apoio rápido para precificar e decidir.</span>
                </li>
                <li className="flex gap-3 text-red-900">
                  <span className="shrink-0 text-lg" aria-hidden>❌</span>
                  <span><strong className="font-semibold">Mercado:</strong> FIPE, cotações e cripto em sites diferentes — ou nem consulta.</span>
                </li>
                <li className="flex gap-3 text-red-900">
                  <span className="shrink-0 text-lg" aria-hidden>❌</span>
                  <span><strong className="font-semibold">Resultado:</strong> estresse, decisões no “achismo” e sensação de estar sempre correndo atrás.</span>
                </li>
              </ul>
            </div>

            <div className="relative overflow-hidden rounded-2xl border-2 border-green-500 bg-green-50 p-8 shadow-xl ring-4 ring-green-500/20">
              <div className="absolute right-0 top-0 rounded-bl-2xl bg-green-500 px-4 py-1 text-xs font-bold uppercase tracking-wide text-black">
                Com OZAPTECHAMA
              </div>
              <div className="mb-5 text-5xl">🎉</div>
              <h3 className="text-2xl font-bold text-green-900">DEPOIS — Com OZAPTECHAMA</h3>
              <p className="mb-6 mt-2 text-green-800">
                Um assistente inteligente no WhatsApp, pronto quando você precisar.
              </p>
              <ul className="space-y-4">
                <li className="flex gap-3 text-green-900">
                  <span className="shrink-0 text-lg" aria-hidden>✅</span>
                  <span><strong className="font-semibold">Finanças:</strong> ganhos, gastos, metas e alertas organizados em conversas simples.</span>
                </li>
                <li className="flex gap-3 text-green-900">
                  <span className="shrink-0 text-lg" aria-hidden>✅</span>
                  <span><strong className="font-semibold">Nutrição:</strong> orientação e apoio alimentar personalizado, sem sair do WhatsApp.</span>
                </li>
                <li className="flex gap-3 text-green-900">
                  <span className="shrink-0 text-lg" aria-hidden>✅</span>
                  <span><strong className="font-semibold">Comercial:</strong> ajuda para vendas, negócios e decisões que impactam o faturamento.</span>
                </li>
                <li className="flex gap-3 text-green-900">
                  <span className="shrink-0 text-lg" aria-hidden>✅</span>
                  <span><strong className="font-semibold">Mercado:</strong> FIPE, mercado financeiro e criptomoedas no Plano Completo.</span>
                </li>
                <li className="flex gap-3 text-green-900">
                  <span className="shrink-0 text-lg" aria-hidden>✅</span>
                  <span><strong className="font-semibold">Resultado:</strong> mais clareza, menos ansiedade e decisões seguras em várias áreas da vida.</span>
                </li>
              </ul>
              <p className="mt-6 rounded-xl bg-green-500/20 px-4 py-3 text-center text-sm font-bold text-green-900">
                A partir de R$ 4,99/mês • Pix ou cartão • Ativação rápida
              </p>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a href={whatsappLink} target="_blank" rel="noreferrer">
              <Button size="lg" className="h-14 bg-green-500 px-8 text-lg font-bold text-black hover:bg-green-600">
                QUERO ESSA TRANSFORMAÇÃO <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
            <a href="#planos" className="text-sm font-bold text-blue-900 underline-offset-4 hover:underline">
              Comparar planos Padrão e Completo
            </a>
          </div>
        </div>
      </section>

      {/* Histórias de Sucesso - Prova Social */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
            Clientes que já começaram 🏆
          </h2>
          <p className="text-center text-xl text-gray-600 mb-12">
            Resultados possíveis quando finanças, nutrição e comércio ficam organizados no WhatsApp.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="bg-white p-8 rounded-lg border-2 border-green-500 text-center">
              <div className="text-6xl font-bold text-green-500 mb-4">R$ 380</div>
              <p className="text-xl font-bold mb-2">Carlos M. - Empresário</p>
              <p className="text-gray-600">"Passei a enxergar melhor meus gastos fixos."</p>
            </div>

            <div className="bg-white p-8 rounded-lg border-2 border-green-500 text-center">
              <div className="text-6xl font-bold text-green-500 mb-4">Metas</div>
              <p className="text-xl font-bold mb-2">Ana Silva - Consultora</p>
              <p className="text-gray-600">"Agora acompanho minhas metas sem planilha."</p>
            </div>

            <div className="bg-white p-8 rounded-lg border-2 border-green-500 text-center">
              <div className="text-6xl font-bold text-green-500 mb-4">FIPE</div>
              <p className="text-xl font-bold mb-2">Roberto F. - Investidor</p>
              <p className="text-gray-600">"Uso o plano completo para consultar veículo e mercado."</p>
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg border-2 border-blue-900">
            <img 
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028484296/azDT7U6LLduZEjhZgggaQx/success-stories-zap-Yz6YqzqeFizjy5cv4Y8Ubx.webp"
              alt="Histórias de Sucesso"
              className="w-full rounded-lg"
            />
          </div>
        </div>
      </section>

      {/* Transformação - Antes e Depois */}
      <section className="bg-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12">
            Transforme sua rotina com inteligência
          </h2>

          <div className="bg-white border-2 border-blue-900 rounded-lg overflow-hidden">
            <img 
              src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028484296/azDT7U6LLduZEjhZgggaQx/transformation-zap-bW8Aid22GqBVYnxQcEsFaa.webp"
              alt="Transformação"
              className="w-full"
            />
          </div>
        </div>
      </section>

      {/* Recursos Principais */}
      <section className="bg-blue-900 text-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12">
            O que você ganha com OZAPTECHAMA
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">💬</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Mensagens no WhatsApp</h3>
                  <p>Receba respostas de finanças, nutrição, comercial e mais no app que você já usa</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">📊</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Relatórios Automáticos</h3>
                  <p>Análise completa de seus gastos e ganhos todos os dias</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🎯</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Metas Inteligentes</h3>
                  <p>Defina objetivos e acompanhe seu progresso em tempo real</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🔔</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Alertas Inteligentes</h3>
                  <p>Notificações quando você está perto de seus limites</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🚗</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Tabela FIPE</h3>
                  <p>Consulte valores de veículos direto pelo WhatsApp no Plano Completo</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🥗</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Nutrição</h3>
                  <p>Orientações e apoio nutricional personalizado pelo WhatsApp</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🏪</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Comercial</h3>
                  <p>Apoio para vendas, negócios e decisões comerciais do dia a dia</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">📈</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Mercado e Criptomoedas</h3>
                  <p>Acompanhe mercado financeiro, moedas e criptoativos no Plano Completo</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="bg-gray-50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 bg-blue-900 text-white px-4 py-2 rounded-full font-bold text-sm mb-4">
              <TrendingUp className="w-4 h-4 text-green-400" />
              Escolha o plano ideal para você
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Planos simples, preço baixo e acesso imediato
            </h2>
            <p className="text-xl text-gray-600">
              Pague por Pix ou cartão de crédito. Sem complicação e com cancelamento quando quiser.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-3xl border-2 border-blue-100 p-8 shadow-lg">
              <div className="mb-6">
                <span className="bg-blue-100 text-blue-900 px-3 py-1 rounded-full text-sm font-bold">Plano Padrão</span>
                <h3 className="text-3xl font-bold mt-4">Essencial multiáreas</h3>
                <p className="text-gray-600 mt-2">Finanças, nutrição e comercial no WhatsApp, sem pagar caro.</p>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-bold text-blue-900">R$ 4,99</span>
                <span className="text-gray-600">/mês</span>
              </div>

              <ul className="space-y-3 text-gray-700 mb-8">
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Finanças, nutrição e apoio comercial pelo WhatsApp</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Alertas, metas e acompanhamento do dia a dia</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Ideal para uso pessoal e profissional</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Sem busca de FIPE, mercado financeiro e criptomoedas</li>
              </ul>

              <a href={whatsappLink} target="_blank" rel="noreferrer" className="block">
                <Button size="lg" className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold">
                  Assinar Padrão por R$ 4,99
                </Button>
              </a>
            </div>

            <div className="relative bg-blue-900 text-white rounded-3xl border-2 border-green-500 p-8 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 bg-green-500 text-black px-5 py-2 rounded-bl-2xl font-bold text-sm">
                MAIS COMPLETO
              </div>

              <div className="mb-6">
                <span className="bg-green-500 text-black px-3 py-1 rounded-full text-sm font-bold">Plano Completo</span>
                <h3 className="text-3xl font-bold mt-4">Completo + mercado e FIPE</h3>
                <p className="text-blue-100 mt-2">Tudo do Padrão, mais FIPE, mercado financeiro, criptomoedas e recursos avançados.</p>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-bold text-green-400">R$ 9,99</span>
                <span className="text-blue-100">/mês</span>
              </div>

              <ul className="space-y-3 text-blue-50 mb-8">
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" /> Tudo do Plano Padrão</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" /> Consulta à Tabela FIPE</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" /> Dados de mercado financeiro</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" /> Informações sobre criptomoedas</li>
              </ul>

              <a href={whatsappLink} target="_blank" rel="noreferrer" className="block">
                <Button size="lg" className="w-full bg-green-500 hover:bg-green-600 text-black font-bold">
                  Assinar Completo por R$ 9,99
                </Button>
              </a>
            </div>
          </div>

          <p className="text-center text-gray-500 mt-8">
            Pagamento via cartão de crédito ou Pix. Ativação liberada após confirmação.
          </p>
        </div>
      </section>

      {/* Segurança e Confiança */}
      <section className="bg-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12">
            Segurança que Você Confia
          </h2>

          <div className="grid items-center gap-12 md:grid-cols-2">
            <div className="relative">
              <div className="absolute -inset-2 rounded-2xl bg-gradient-to-br from-green-400/30 to-blue-600/20 blur-xl" aria-hidden />
              <img
                src="/images/seguranca-confianca.svg"
                alt="Proteção de dados no WhatsApp: escudo, criptografia e privacidade no OZAPTECHAMA"
                width={640}
                height={520}
                className="relative w-full rounded-2xl border-2 border-green-500/40 shadow-xl"
                loading="lazy"
                decoding="async"
              />
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="text-4xl">🛡️</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Proteção em 1º Lugar</h3>
                  <p className="text-gray-600">Seus dados são protegidos com criptografia de nível bancário</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="text-4xl">✅</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Confiança que Conta</h3>
                  <p className="text-gray-600">Certificado e aprovado por especialistas em segurança digital</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="text-4xl">🔐</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Dados Criptografados</h3>
                  <p className="text-gray-600">Nem mesmo nossos servidores acessam seus dados sem permissão</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="text-4xl">📱</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Segurança e Transparência</h3>
                  <p className="text-gray-600">Você tem controle total sobre quem acessa suas informações</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Objeções e Respostas */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12">
            Dúvidas Frequentes
          </h2>

          <div className="space-y-4 max-w-3xl mx-auto">
            <details className="bg-white p-6 rounded-lg border-2 border-blue-900 cursor-pointer">
              <summary className="font-bold text-lg text-blue-900">
                💳 Preciso de cartão de crédito?
              </summary>
              <p className="mt-4 text-gray-600">Não. Você pode pagar por Pix ou cartão de crédito. O Plano Padrão custa R$ 4,99/mês e o Plano Completo custa R$ 9,99/mês.</p>
            </details>

            <details className="bg-white p-6 rounded-lg border-2 border-blue-900 cursor-pointer">
              <summary className="font-bold text-lg text-blue-900">
                📊 Qual a diferença entre os planos?
              </summary>
              <p className="mt-4 text-gray-600">O Padrão cobre finanças, nutrição e comercial pelo WhatsApp. O Completo adiciona Tabela FIPE, mercado financeiro, criptomoedas e recursos avançados.</p>
            </details>

            <details className="bg-white p-6 rounded-lg border-2 border-blue-900 cursor-pointer">
              <summary className="font-bold text-lg text-blue-900">
                ⏱️ Quanto tempo leva para começar?
              </summary>
              <p className="mt-4 text-gray-600">A ativação é rápida após a confirmação do pagamento. Depois disso, você já pode começar a usar pelo WhatsApp.</p>
            </details>

            <details className="bg-white p-6 rounded-lg border-2 border-blue-900 cursor-pointer">
              <summary className="font-bold text-lg text-blue-900">
                🔒 Meus dados estão seguros?
              </summary>
              <p className="mt-4 text-gray-600">Sim! Usamos criptografia de nível bancário. Seus dados nunca são compartilhados.</p>
            </details>

            <details className="bg-white p-6 rounded-lg border-2 border-blue-900 cursor-pointer">
              <summary className="font-bold text-lg text-blue-900">
                ❌ Posso cancelar quando quiser?
              </summary>
              <p className="mt-4 text-gray-600">Claro! Sem compromisso. Cancele quando quiser, sem perguntas.</p>
            </details>
          </div>
        </div>
      </section>

      {/* Garantia */}
      <section className="bg-green-500 text-black py-12 md:py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ✅ Comece com um plano acessível
          </h2>
          <p className="text-lg">
            Escolha entre R$ 4,99/mês no Padrão ou R$ 9,99/mês no Completo, com pagamento por Pix ou cartão.
          </p>
        </div>
      </section>

      {/* CTA Final com Urgência */}
      <section className="bg-blue-900 text-white py-20 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-block bg-green-500 text-black px-4 py-2 rounded-full font-bold mb-6">
            PLANOS DISPONÍVEIS PARA ATIVAÇÃO
          </div>

          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Comece com seu assistente completo agora
          </h2>

          <p className="text-xl text-green-300 mb-8 max-w-2xl mx-auto">
            {TAGLINE}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <input
              type="email"
              placeholder="Seu melhor email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-6 py-4 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 sm:flex-none text-lg"
            />
            <a href={whatsappLink} target="_blank" rel="noreferrer">
              <Button 
                size="lg"
                className="bg-green-500 hover:bg-green-600 text-black font-bold h-14 px-8 rounded-lg text-lg"
              >
                QUERO ESCOLHER MEU PLANO <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </a>
          </div>

          <p className="text-sm text-green-300 font-bold">
            ✨ Plano Padrão R$ 4,99 • Completo R$ 9,99 • Pix ou cartão
          </p>

          <div className="mt-12 grid gap-6 text-center md:grid-cols-3">
            <div className="px-2">
              <p className="text-4xl font-bold text-green-500">{activeUsers.toLocaleString()}</p>
              <p className="text-pretty text-sm leading-snug">Usuários OZAPTECHAMA ativos</p>
            </div>
            <div className="px-2">
              <p className="text-4xl font-bold text-green-500">R$ {totalSavings.toLocaleString('pt-BR')}</p>
              <p className="text-pretty text-sm leading-snug">Em gastos organizados</p>
            </div>
            <div className="px-2">
              <p className="text-4xl font-bold text-red-500">{spotsLeft}</p>
              <p className="text-pretty text-sm leading-snug">Ativações promocionais</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-900 text-white border-t-4 border-green-500 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <img src="/logo-icon-light.svg" alt="OZAPTECHAMA" className="h-14 w-14 flex-shrink-0" />
                <p className="font-extrabold text-xl text-white leading-tight">OZAPTECHAMA</p>
              </div>
              <p className="text-sm text-gray-300">{TAGLINE_FOOTER}</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">Produto</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><a href="#" className="hover:text-green-500">Recursos</a></li>
                <li><a href="#" className="hover:text-green-500">Segurança</a></li>
                <li><a href="#" className="hover:text-green-500">Preços</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Empresa</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><a href="#" className="hover:text-green-500">Sobre</a></li>
                <li><a href="#" className="hover:text-green-500">Blog</a></li>
                <li><a href="#" className="hover:text-green-500">Contato</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-300">
                <li><a href="#" className="hover:text-green-500">Privacidade</a></li>
                <li><a href="#" className="hover:text-green-500">Termos</a></li>
                <li><a href="#" className="hover:text-green-500">Cookies</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-blue-800 pt-8 text-center text-sm text-gray-300">
            <p>&copy; 2024 OZAPTECHAMA. Todos os direitos reservados. | www.ozaptechama.com.br</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
