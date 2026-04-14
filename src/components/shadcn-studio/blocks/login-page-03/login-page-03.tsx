import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, MessageSquare, BrainCircuit, ShieldCheck } from 'lucide-react'

import Logo from '@/components/shadcn-studio/logo'
import LogoVector from '@/assets/svg/logo-vector'
import LoginForm from '@/components/shadcn-studio/blocks/login-page-03/login-form'

const features = [
  {
    icon: BarChart3,
    title: 'Pipeline em tempo real',
    description: 'Acompanhe cada lead do primeiro contato ao fechamento',
  },
  {
    icon: MessageSquare,
    title: 'Historico de conversas',
    description: 'Revise tudo que a IA conversou com o cliente',
  },
  {
    icon: BrainCircuit,
    title: 'Insights automaticos',
    description: 'Intencao, orcamento e proxima acao sugerida por IA',
  },
  {
    icon: ShieldCheck,
    title: 'Controle total',
    description: 'Assuma a negociacao no momento certo',
  },
]

const Login = () => {
  return (
    <div className='h-dvh lg:grid lg:grid-cols-2'>
      <div className='flex h-full items-center justify-center space-y-6 sm:px-6 md:px-8'>
        <div className='flex w-full flex-col gap-6 p-6 sm:max-w-lg'>
          <Logo className='gap-3' />

          <div>
            <h2 className='mb-1.5 text-2xl font-semibold'>Bem-vindo de volta</h2>
            <p className='text-muted-foreground'>Acesse o painel de controle do Aja Agora</p>
          </div>

          <div className='space-y-4'>
            <LoginForm />
          </div>
        </div>
      </div>

      <div className='bg-muted h-screen p-5 max-lg:hidden'>
        <Card className='bg-primary relative h-full justify-between overflow-hidden border-none py-8'>
          <CardHeader className='gap-6 px-8'>
            <div className='flex items-center gap-2 text-primary-foreground/60 text-sm font-medium uppercase tracking-widest'>
              <ShieldCheck className='size-4' />
              Acesso restrito — Equipe Aja Agora
            </div>
            <CardTitle className='text-primary-foreground text-4xl font-bold xl:text-5xl/15.5'>
              Seu painel de vendas com inteligencia artificial
            </CardTitle>
            <p className='text-primary-foreground/80 text-lg'>
              A IA conduz os clientes ate a recomendacao. Voce assume quando importa — com contexto completo e insights prontos.
            </p>
          </CardHeader>

          <LogoVector className='text-secondary/10 pointer-events-none absolute bottom-30 -left-50 size-130' />

          <CardContent className='relative z-1 mx-8 px-0'>
            <div className='grid grid-cols-2 gap-4'>
              {features.map((feature) => (
                <div
                  key={feature.title}
                  className='bg-card/10 backdrop-blur-sm rounded-xl p-5 border border-primary-foreground/10'
                >
                  <div className='flex items-center gap-3 mb-3'>
                    <div className='flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15'>
                      <feature.icon className='size-5 text-primary-foreground' />
                    </div>
                  </div>
                  <p className='text-primary-foreground font-semibold text-sm mb-1'>{feature.title}</p>
                  <p className='text-primary-foreground/70 text-xs leading-relaxed'>{feature.description}</p>
                </div>
              ))}
            </div>

            <div className='mt-6 flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <div className='size-2 rounded-full bg-green-400 animate-pulse' />
                <span className='text-primary-foreground/60 text-xs'>IA ativa — atendendo clientes agora</span>
              </div>
              <span className='text-primary-foreground/40 text-xs'>v1.0</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login
