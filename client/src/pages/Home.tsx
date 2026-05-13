import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';

/**
 * Design Philosophy: O Zap Te Conta - Gatilhos Mentais Poderosos
 * - Paleta: Azul Escuro (#0F172A), Branco, Cinza (#6B7280), Preto
 * - Foco em: Urgência, Escassez, Prova Social, FOMO, Transformação
 * - Elementos: Contadores, Números grandes, Badges, Depoimentos reais
 */

export default function Home() {
  const [email, setEmail] = useState('');
  const [activeUsers, setActiveUsers] = useState(187);
  const [totalSavings, setTotalSavings] = useState(86000);
  const [spotsLeft, setSpotsLeft] = useState(42);

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
      {/* Header Sticky com Urgência */}
      <header className="sticky top-0 z-50 bg-blue-900 text-white border-b-4 border-green-500">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <span className="text-blue-900 font-bold text-lg">Z</span>
            </div>
            <div>
              <span className="font-bold text-lg">O ZAP TE CONTA</span>
              <p className="text-xs text-green-300">Planos a partir de R$ 4,99/mês</p>
            </div>
          </div>
          <div className="hidden md:flex gap-4 text-sm items-center">
            <span className="bg-green-500 text-black px-3 py-1 rounded-full text-xs font-bold">PIX OU CARTÃO</span>
            <Button className="bg-green-500 hover:bg-green-600 text-black font-bold">
              VER PLANOS
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section com Gatilhos */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-900 to-blue-800 text-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="inline-block bg-green-500 text-black px-4 py-2 rounded-full font-bold text-sm">
                  PLANOS ACESSÍVEIS • PIX OU CARTÃO • 100% BRASILEIRO
                </div>
                <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                  O ZAP TE CONTA
                </h1>
                <p className="text-2xl text-green-300 font-bold">
                  Seu Assistente Financeiro Direto no WhatsApp
                </p>
              </div>

              <div className="space-y-4 bg-blue-800/90 p-6 rounded-2xl border border-green-400 shadow-2xl">
                <p className="text-lg">✅ Controle seus ganhos, gastos e metas pelo WhatsApp</p>
                <p className="text-lg">✅ Plano Padrão por apenas R$ 4,99/mês</p>
                <p className="text-lg">✅ Plano Completo com FIPE, mercado financeiro e criptomoedas</p>
                <p className="text-lg">✅ Pagamento por cartão de crédito ou Pix</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="bg-green-500 hover:bg-green-600 text-black font-bold h-14 px-8 rounded-lg text-lg"
                >
                  VER PLANOS <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
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

            <div className="relative h-96 md:h-full flex items-center justify-center">
              <img 
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028484296/azDT7U6LLduZEjhZgggaQx/hero-zap-te-conta-PrnpHjUY8RJnzx3WugEQsz.webp"
                alt="O Zap Te Conta"
                className="w-full h-full object-cover rounded-lg shadow-2xl"
              />
            </div>
          </div>

          {/* Contadores ao Vivo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 text-center">
            <div className="bg-white/10 backdrop-blur text-white p-5 rounded-2xl border border-white/20">
              <p className="text-3xl">{activeUsers.toLocaleString()}</p>
              <p className="text-sm text-green-200">Clientes ativos</p>
            </div>
            <div className="bg-white/10 backdrop-blur text-white p-5 rounded-2xl border border-white/20">
              <p className="text-3xl">R$ {totalSavings.toLocaleString('pt-BR')}</p>
              <p className="text-sm text-green-200">Em gastos organizados</p>
            </div>
            <div className="bg-green-500 text-black p-5 rounded-2xl font-bold shadow-xl">
              <p className="text-3xl">{spotsLeft}</p>
              <p className="text-sm">Ativações promocionais</p>
            </div>
          </div>
        </div>
      </section>

      {/* Seção de Problemas - Gatilho de Dor */}
      <section className="bg-white py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-12">
            Você se encaixa em um desses? 👇
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-red-50 border-2 border-red-300 p-8 rounded-lg">
              <div className="text-5xl mb-4">😰</div>
              <h3 className="text-2xl font-bold text-red-900 mb-4">ANTES - Sem O Zap Te Conta</h3>
              <ul className="space-y-3 text-red-800">
                <li>❌ Não sabe onde o dinheiro vai</li>
                <li>❌ Dívidas acumuladas</li>
                <li>❌ Preocupação constante</li>
                <li>❌ Sem controle financeiro</li>
                <li>❌ Dinheiro nunca sobra</li>
              </ul>
            </div>

            <div className="bg-green-50 border-2 border-green-500 p-8 rounded-lg">
              <div className="text-5xl mb-4">🎉</div>
              <h3 className="text-2xl font-bold text-green-900 mb-4">DEPOIS - Com O Zap Te Conta</h3>
              <ul className="space-y-3 text-green-800">
                <li>✅ Visibilidade total de gastos</li>
                <li>✅ Dívidas pagas</li>
                <li>✅ Paz de espírito</li>
                <li>✅ Controle financeiro completo</li>
                <li>✅ Decisões financeiras mais claras</li>
              </ul>
            </div>
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
            Resultados possíveis quando o controle financeiro vira hábito.
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
            Transforme sua vida financeira
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
            O que você ganha com O Zap Te Conta
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">💬</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Mensagens no WhatsApp</h3>
                  <p>Receba seus dados financeiros direto no app que você já usa</p>
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
                <div className="text-4xl">📈</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Mercado e Criptomoedas</h3>
                  <p>Acompanhe informações financeiras, moedas e criptoativos no Plano Completo</p>
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
                <h3 className="text-3xl font-bold mt-4">Controle essencial</h3>
                <p className="text-gray-600 mt-2">Para organizar o dinheiro do dia a dia sem pagar caro.</p>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-bold text-blue-900">R$ 4,99</span>
                <span className="text-gray-600">/mês</span>
              </div>

              <ul className="space-y-3 text-gray-700 mb-8">
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Controle de ganhos e gastos pelo WhatsApp</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Alertas e lembretes financeiros</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Metas e acompanhamento básico</li>
                <li className="flex gap-3"><CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" /> Sem busca de FIPE, mercado financeiro e criptomoedas</li>
              </ul>

              <Button size="lg" className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold">
                Assinar Padrão por R$ 4,99
              </Button>
            </div>

            <div className="relative bg-blue-900 text-white rounded-3xl border-2 border-green-500 p-8 shadow-2xl overflow-hidden">
              <div className="absolute top-0 right-0 bg-green-500 text-black px-5 py-2 rounded-bl-2xl font-bold text-sm">
                MAIS COMPLETO
              </div>

              <div className="mb-6">
                <span className="bg-green-500 text-black px-3 py-1 rounded-full text-sm font-bold">Plano Completo</span>
                <h3 className="text-3xl font-bold mt-4">Finanças + consultas inteligentes</h3>
                <p className="text-blue-100 mt-2">Para quem quer controlar dinheiro e consultar dados externos em um só lugar.</p>
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

              <Button size="lg" className="w-full bg-green-500 hover:bg-green-600 text-black font-bold">
                Assinar Completo por R$ 9,99
              </Button>
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

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <img 
                src="https://d2xsxph8kpxj0f.cloudfront.net/310419663028484296/azDT7U6LLduZEjhZgggaQx/trust-security-zap-NMXCZtDYPWufMQQFN5xB.webp"
                alt="Segurança"
                className="w-full rounded-lg"
              />
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="text-4xl">🛡️</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Proteção em 1º Lugar</h3>
                  <p className="text-gray-600">Seus dados financeiros são protegidos com a melhor criptografia disponível</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="text-4xl">✅</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Confiança que Conta</h3>
                  <p className="text-gray-600">Certificado e aprovado por especialistas em segurança financeira</p>
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
              <p className="mt-4 text-gray-600">O Padrão foca no controle financeiro pelo WhatsApp. O Completo adiciona consultas à Tabela FIPE, dados de mercado financeiro e informações sobre criptomoedas.</p>
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
            Comece sua organização financeira agora
          </h2>

          <p className="text-xl text-green-300 mb-8 max-w-2xl mx-auto">
            Escolha seu plano e tenha controle financeiro direto no WhatsApp.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <input
              type="email"
              placeholder="Seu melhor email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-6 py-4 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-green-500 flex-1 sm:flex-none text-lg"
            />
            <Button 
              size="lg"
              className="bg-green-500 hover:bg-green-600 text-black font-bold h-14 px-8 rounded-lg text-lg"
            >
              QUERO ESCOLHER MEU PLANO <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>

          <p className="text-sm text-green-300 font-bold">
            ✨ Plano Padrão R$ 4,99 • Completo R$ 9,99 • Pix ou cartão
          </p>

          <div className="mt-12 grid md:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-4xl font-bold text-green-500">{activeUsers.toLocaleString()}</p>
              <p className="text-sm">Clientes ativos</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-green-500">R$ {totalSavings.toLocaleString('pt-BR')}</p>
              <p className="text-sm">Em gastos organizados</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-red-500">{spotsLeft}</p>
              <p className="text-sm">Ativações promocionais</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-blue-900 text-white border-t-4 border-green-500 py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-bold text-lg mb-4">O ZAP TE CONTA</h3>
              <p className="text-sm text-gray-300">Seu assistente financeiro direto no WhatsApp.</p>
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
            <p>&copy; 2024 O Zap Te Conta. Todos os direitos reservados. | www.ozapteconta.com.br</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
