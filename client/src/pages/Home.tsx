import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Lock, Zap, AlertCircle, TrendingUp, Users, DollarSign, Target, Shield } from 'lucide-react';
import { useState, useEffect } from 'react';

/**
 * Design Philosophy: O Zap Te Conta - Gatilhos Mentais Poderosos
 * - Paleta: Azul Escuro (#0F172A), Branco, Cinza (#6B7280), Preto
 * - Foco em: Urgência, Escassez, Prova Social, FOMO, Transformação
 * - Elementos: Contadores, Números grandes, Badges, Depoimentos reais
 */

export default function Home() {
  const [email, setEmail] = useState('');
  const [activeUsers, setActiveUsers] = useState(2847);
  const [totalSavings, setTotalSavings] = useState(12500000);
  const [spotsLeft, setSpotsLeft] = useState(156);

  useEffect(() => {
    // Simular contadores ao vivo
    const interval = setInterval(() => {
      setActiveUsers(prev => prev + Math.floor(Math.random() * 3));
      setTotalSavings(prev => prev + Math.floor(Math.random() * 5000));
      setSpotsLeft(prev => (prev > 0 ? prev - 1 : 156));
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
              <p className="text-xs text-green-300">⚡ 2.847 pessoas usando AGORA</p>
            </div>
          </div>
          <div className="hidden md:flex gap-4 text-sm items-center">
            <span className="bg-red-500 px-3 py-1 rounded-full text-xs font-bold">🔥 OFERTA LIMITADA</span>
            <Button className="bg-green-500 hover:bg-green-600 text-black font-bold">
              COMEÇAR AGORA
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
                  ⚡ SUCESSO NO SEU BOLSO, LIBERDADE NA SUA VIDA!
                </div>
                <h1 className="text-5xl md:text-6xl font-bold leading-tight">
                  O ZAP TE CONTA
                </h1>
                <p className="text-2xl text-green-300 font-bold">
                  Seu Assistente Financeiro Direto no WhatsApp
                </p>
              </div>

              <div className="space-y-4 bg-blue-800 p-6 rounded-lg border-2 border-green-500">
                <p className="text-lg">✅ Receba alertas sobre seu dinheiro</p>
                <p className="text-lg">✅ Controle seus ganhos e gastos</p>
                <p className="text-lg">✅ Alcance suas metas mais rápido</p>
                <p className="text-lg">✅ Segurança e privacidade total</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg" 
                  className="bg-green-500 hover:bg-green-600 text-black font-bold h-14 px-8 rounded-lg text-lg"
                >
                  COMEÇAR AGORA <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="border-2 border-white text-white hover:bg-blue-700 font-bold h-14 px-8 rounded-lg text-lg"
                >
                  VER DEMO
                </Button>
              </div>

              <p className="text-sm text-green-300 font-bold">
                ✨ Sem cartão de crédito • Acesso imediato • 100% brasileiro
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
          <div className="grid grid-cols-3 gap-4 mt-12 text-center">
            <div className="bg-green-500 text-black p-4 rounded-lg font-bold">
              <p className="text-3xl">{activeUsers.toLocaleString()}</p>
              <p className="text-sm">Pessoas usando AGORA</p>
            </div>
            <div className="bg-green-500 text-black p-4 rounded-lg font-bold">
              <p className="text-3xl">R$ {(totalSavings / 1000000).toFixed(1)}M</p>
              <p className="text-sm">Economizados</p>
            </div>
            <div className="bg-red-500 text-white p-4 rounded-lg font-bold">
              <p className="text-3xl">{spotsLeft}</p>
              <p className="text-sm">Vagas restantes</p>
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
                <li>✅ Economia de R$ 2.000+/mês</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Histórias de Sucesso - Prova Social */}
      <section className="bg-gray-50 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
            Histórias de Sucesso 🏆
          </h2>
          <p className="text-center text-xl text-gray-600 mb-12">
            Pessoas reais. Resultados reais.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="bg-white p-8 rounded-lg border-2 border-green-500 text-center">
              <div className="text-6xl font-bold text-green-500 mb-4">R$ 2.500</div>
              <p className="text-xl font-bold mb-2">Carlos M. - Empresário</p>
              <p className="text-gray-600">"Economizei em apenas 2 meses!"</p>
            </div>

            <div className="bg-white p-8 rounded-lg border-2 border-green-500 text-center">
              <div className="text-6xl font-bold text-green-500 mb-4">Dívidas</div>
              <p className="text-xl font-bold mb-2">Ana Silva - Consultora</p>
              <p className="text-gray-600">"Paguei todas as minhas dívidas!"</p>
            </div>

            <div className="bg-white p-8 rounded-lg border-2 border-green-500 text-center">
              <div className="text-6xl font-bold text-green-500 mb-4">R$ 10K</div>
              <p className="text-xl font-bold mb-2">Roberto F. - Investidor</p>
              <p className="text-gray-600">"Consegui investir R$ 10 mil!"</p>
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
                <div className="text-4xl">💡</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">Dicas de Economia</h3>
                  <p>Recomendações personalizadas para economizar mais</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-800 p-8 rounded-lg border-2 border-green-500">
              <div className="flex items-start gap-4">
                <div className="text-4xl">🔒</div>
                <div>
                  <h3 className="text-2xl font-bold mb-2">100% Seguro</h3>
                  <p>Criptografia de nível bancário protege seus dados</p>
                </div>
              </div>
            </div>
          </div>
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
              <p className="mt-4 text-gray-600">Não! O Zap Te Conta é 100% gratuito. Sem cartão de crédito, sem cobranças ocultas.</p>
            </details>

            <details className="bg-white p-6 rounded-lg border-2 border-blue-900 cursor-pointer">
              <summary className="font-bold text-lg text-blue-900">
                ⏱️ Quanto tempo leva para começar?
              </summary>
              <p className="mt-4 text-gray-600">Apenas 3 minutos! Você se cadastra, conecta sua conta e já começa a receber alertas.</p>
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
            ✅ Garantia 30 Dias ou Dinheiro de Volta
          </h2>
          <p className="text-lg">
            Não gostou? Devolvemos 100% do seu dinheiro. Sem perguntas, sem complicações.
          </p>
        </div>
      </section>

      {/* CTA Final com Urgência */}
      <section className="bg-blue-900 text-white py-20 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-block bg-red-500 text-white px-4 py-2 rounded-full font-bold mb-6">
            ⏰ OFERTA VÁLIDA POR 48 HORAS
          </div>

          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Comece Sua Transformação Financeira AGORA
          </h2>

          <p className="text-xl text-green-300 mb-8 max-w-2xl mx-auto">
            Junte-se a 2.847 pessoas que estão mudando suas vidas financeiras neste exato momento.
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
              COMEÇAR AGORA <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>

          <p className="text-sm text-green-300 font-bold">
            ✨ Sem cartão de crédito • Acesso imediato • Ganhe R$ 100 em créditos
          </p>

          <div className="mt-12 grid md:grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-4xl font-bold text-green-500">{activeUsers.toLocaleString()}</p>
              <p className="text-sm">Pessoas usando AGORA</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-green-500">R$ {(totalSavings / 1000000).toFixed(1)}M</p>
              <p className="text-sm">Economizados este mês</p>
            </div>
            <div>
              <p className="text-4xl font-bold text-red-500">{spotsLeft}</p>
              <p className="text-sm">Vagas restantes</p>
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
