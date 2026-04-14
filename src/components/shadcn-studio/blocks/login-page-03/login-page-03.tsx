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
            <p className='text-muted-foreground'>Acesse o painel de controle</p>
          </div>

          <div className='space-y-4'>
            <LoginForm />
          </div>
        </div>
      </div>

      <div className='bg-muted h-screen p-5 max-lg:hidden'>
        <Card className='bg-primary relative flex h-full flex-col items-center justify-center overflow-hidden border-none'>
          <LogoVector className='text-secondary/10 pointer-events-none absolute -left-40 -bottom-20 size-130' />

          <CardHeader className='relative z-1 text-center px-16'>
            <CardTitle className='text-primary-foreground text-5xl font-bold leading-tight'>
              Aja Agora
            </CardTitle>
            <p className='text-primary-foreground/70 text-lg mt-3'>
              Painel de vendas inteligente
            </p>
          </CardHeader>

          <CardContent className='relative z-1'>
            <div className='flex items-center gap-2'>
              <div className='size-2 rounded-full bg-green-400 animate-pulse' />
              <span className='text-primary-foreground/50 text-sm'>IA ativa</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login
