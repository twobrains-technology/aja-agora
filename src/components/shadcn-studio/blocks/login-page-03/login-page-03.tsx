import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import Logo from '@/components/shadcn-studio/logo'
import LogoVector from '@/assets/svg/logo-vector'
import LoginForm from '@/components/shadcn-studio/blocks/login-page-03/login-form'

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
            <CardTitle className='text-primary-foreground text-4xl font-bold xl:text-5xl/15.5'>
              Gerencie seus leads de consorcio com inteligencia artificial
            </CardTitle>
            <p className='text-primary-foreground text-xl'>
              Acompanhe o funil de vendas, visualize conversas e receba insights automaticos sobre cada lead.
            </p>
          </CardHeader>

          <LogoVector className='text-secondary/10 pointer-events-none absolute bottom-30 -left-50 size-130' />

          <CardContent className='relative z-1 mx-8 h-62 overflow-hidden rounded-2xl px-0'>
            <svg
              width='1094'
              height='249'
              viewBox='0 0 1094 249'
              fill='none'
              xmlns='http://www.w3.org/2000/svg'
              className='pointer-events-none absolute right-0 -z-1 select-none'
            >
              <path
                d='M0.263672 16.8809C0.263672 8.0443 7.42712 0.880859 16.2637 0.880859H786.394H999.115C1012.37 0.880859 1023.12 11.626 1023.12 24.8808L1023.12 47.3809C1023.12 60.6357 1033.86 71.3809 1047.12 71.3809H1069.6C1082.85 71.3809 1093.6 82.126 1093.6 95.3809L1093.6 232.881C1093.6 241.717 1086.43 248.881 1077.6 248.881H16.2637C7.42716 248.881 0.263672 241.717 0.263672 232.881V16.8809Z'
                fill='var(--card)'
              />
            </svg>

            <div className='bg-card absolute top-0 right-0 flex size-15 items-center justify-center rounded-2xl'>
              <LogoVector className='size-15' />
            </div>

            <div className='flex flex-col gap-5 p-6'>
              <p className='line-clamp-2 pr-12 text-3xl font-bold'>Pipeline de vendas inteligente</p>
              <p className='line-clamp-2 text-lg'>
                Kanban visual, replay de conversas, insights AI e dashboard com metricas do funil — tudo em um so lugar.
              </p>

              <div className='flex items-center gap-3 self-end'>
                <div className='flex items-center gap-2 rounded-full bg-card/80 px-4 py-2'>
                  <div className='size-2 rounded-full bg-green-500 animate-pulse' />
                  <span className='text-sm font-medium'>AI ativa 24/7</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login
