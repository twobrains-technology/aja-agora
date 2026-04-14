import Logo from '@/components/shadcn-studio/logo'
import LogoVector from '@/assets/svg/logo-vector'
import LoginForm from '@/components/shadcn-studio/blocks/login-page-03/login-form'
import { ThemeToggle } from '@/components/ui/theme-toggle'

const Login = () => {
  return (
    <div className='h-dvh lg:grid lg:grid-cols-2'>
      {/* Left — Form */}
      <div className='relative flex h-full items-center justify-center px-8'>
        <div className='absolute top-6 right-6'>
          <ThemeToggle />
        </div>
        <div className='w-full max-w-sm space-y-8'>
          <Logo className='gap-3' />

          <div>
            <h2 className='text-2xl font-semibold tracking-tight'>Bem-vindo de volta</h2>
            <p className='text-muted-foreground mt-1'>Acesse o painel de controle</p>
          </div>

          <LoginForm />
        </div>
      </div>

      {/* Right — Brand panel */}
      <div className='relative hidden h-full overflow-hidden bg-primary lg:flex lg:flex-col lg:justify-between p-10'>
        <LogoVector className='pointer-events-none absolute -right-24 -bottom-24 size-96 text-primary-foreground/[0.06]' />

        <div />

        <div className='relative z-10 space-y-4'>
          <h1 className='text-4xl font-bold tracking-tight text-primary-foreground'>
            Aja Agora
          </h1>
          <p className='text-lg text-primary-foreground/70 max-w-sm'>
            Painel de vendas inteligente para a sua operacao de consorcio.
          </p>
        </div>

        <div className='relative z-10 flex items-center gap-2'>
          <div className='size-2 rounded-full bg-green-300 animate-pulse' />
          <span className='text-sm text-primary-foreground/50'>IA ativa — atendendo clientes agora</span>
        </div>
      </div>
    </div>
  )
}

export default Login
