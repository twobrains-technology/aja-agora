'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'
import {
  Bot,
  Home,
  Car,
  Bike,
  Sparkles,
  MessageCircle,
  ArrowRight
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { MotionPreset } from '@/components/ui/motion-preset'

export const GOALS = [
  {
    id: 'imovel',
    icon: Home,
    label: 'Imovel',
    sub: 'Casa ou apartamento',
    message: 'Quero comprar um imovel, me ajude a encontrar o melhor consorcio',
  },
  {
    id: 'auto',
    icon: Car,
    label: 'Carro',
    sub: 'Novo ou seminovo',
    message: 'Quero comprar um carro, qual o melhor consorcio para mim?',
  },
  {
    id: 'moto',
    icon: Bike,
    label: 'Moto',
    sub: 'Nova ou usada',
    message: 'Quero comprar uma moto, qual o melhor consorcio para mim?',
  }
]

interface HeroSection25Props {
  onGoalSelected: (message: string) => void
}

const HeroSection25 = ({ onGoalSelected }: HeroSection25Props) => {
  const [phase, setPhase] = useState<'typing' | 'question' | 'cards' | 'selected'>('typing')
  const [typedText, setTypedText] = useState('')
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)

  const fullText = 'Ola! Eu sou seu consultor de consorcio.'

  // Typing animation
  useEffect(() => {
    if (phase !== 'typing') return
    let i = 0
    const interval = setInterval(() => {
      i++
      setTypedText(fullText.slice(0, i))
      if (i >= fullText.length) {
        clearInterval(interval)
        setTimeout(() => setPhase('question'), 400)
      }
    }, 35)
    return () => clearInterval(interval)
  }, [phase])

  const handleSelect = useCallback(
    (goal: (typeof GOALS)[number]) => {
      setSelectedGoal(goal.id)
      setPhase('selected')
      setTimeout(() => onGoalSelected(goal.message), 800)
    },
    [onGoalSelected]
  )

  return (
    <section className='relative overflow-hidden py-12 sm:py-20 lg:py-28'>
      {/* Background glow */}
      <div className='pointer-events-none absolute inset-0 overflow-hidden'>
        <div className='absolute left-1/2 top-1/4 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]' />
      </div>

      <div className='relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <div className='grid gap-10 lg:grid-cols-2 lg:gap-16 items-center'>
          {/* Left Column -- Text */}
          <div className='flex flex-col gap-6'>
            <MotionPreset fade blur='4px' slide={{ direction: 'down', offset: 12 }}>
              <div className='flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-2 backdrop-blur-sm w-fit'>
                <Badge className='gap-1'>
                  <Sparkles className='size-3' />
                  IA
                </Badge>
                <span className='text-muted-foreground text-sm'>Consorcio inteligente</span>
              </div>
            </MotionPreset>

            <MotionPreset fade blur='6px' slide={{ direction: 'up', offset: 16 }} delay={0.15}>
              <h1 className='text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl'>
                Seu consorcio, do sonho{' '}
                <span className='bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent'>
                  a assinatura
                </span>
              </h1>
            </MotionPreset>

            <MotionPreset fade blur='4px' slide={{ direction: 'up', offset: 12 }} delay={0.3}>
              <p className='text-muted-foreground text-base sm:text-lg max-w-lg'>
                Sem formulario, sem corretor. Converse com nosso agente inteligente e encontre o consorcio perfeito para voce em minutos.
              </p>
            </MotionPreset>

            <MotionPreset fade slide={{ direction: 'up', offset: 12 }} delay={0.45}>
              <div className='flex flex-wrap gap-3'>
                <Button
                  size='lg'
                  className='gap-2'
                  render={<Link href='/chat' />}
                  nativeButton={false}
                >
                  Comecar agora
                  <ArrowRight className='size-4' />
                </Button>
                <Button
                  size='lg'
                  variant='outline'
                  render={<a href='#como-funciona' />}
                  nativeButton={false}
                >
                  Como funciona
                </Button>
              </div>
            </MotionPreset>
          </div>

          {/* Right Column -- Chat Preview */}
          <div className='relative w-full'>
            {/* Subtle radial glow behind the card */}
            <div className='pointer-events-none absolute -inset-8 z-0'>
              <div className='absolute inset-0 rounded-full bg-primary/[0.04] blur-[80px]' />
            </div>

            <MotionPreset
              fade
              zoom={{ initialScale: 0.97, scale: 1 }}
              slide={{ direction: 'up', offset: 24 }}
              delay={0.3}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              className='relative z-10'
            >
              <Card className='overflow-hidden border-border/50 shadow-2xl shadow-primary/5'>
                {/* Window Chrome */}
                <div className='flex items-center gap-2 border-b bg-muted/30 px-4 py-3'>
                  <span className='size-2.5 rounded-full bg-red-400/50' />
                  <span className='size-2.5 rounded-full bg-yellow-400/50' />
                  <span className='size-2.5 rounded-full bg-green-400/50' />
                  <span className='ml-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
                    <MessageCircle className='size-3' />
                    Aja Agora
                  </span>
                </div>

                <CardContent className='min-h-[320px] space-y-4 p-5 sm:min-h-[360px] sm:p-6'>
                  {/* Bot message - typing */}
                  <div className='flex items-start gap-3'>
                    <motion.div
                      className='flex size-9 shrink-0 items-center justify-center rounded-full bg-primary'
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.5 }}
                    >
                      <Bot className='size-4 text-primary-foreground' />
                    </motion.div>
                    <div className='flex flex-col gap-3'>
                      <motion.div
                        className='inline-block max-w-[90%] rounded-2xl rounded-tl-sm border bg-card px-4 py-3'
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.6 }}
                      >
                        <p className='text-sm leading-relaxed'>
                          {typedText}
                          {phase === 'typing' && (
                            <motion.span
                              className='ml-0.5 inline-block h-4 w-0.5 bg-foreground'
                              animate={{ opacity: [1, 0] }}
                              transition={{ duration: 0.5, repeat: Infinity }}
                            />
                          )}
                        </p>
                      </motion.div>

                      {/* Question - appears after typing */}
                      <AnimatePresence>
                        {(phase === 'question' || phase === 'cards' || phase === 'selected') && (
                          <motion.div
                            className='inline-block max-w-[90%] rounded-2xl rounded-tl-sm border bg-card px-4 py-3'
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            onAnimationComplete={() => {
                              if (phase === 'question') setPhase('cards')
                            }}
                          >
                            <p className='text-sm font-medium leading-relaxed'>
                              O que voce quer conquistar?
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Goal Cards - appear with stagger */}
                  <AnimatePresence>
                    {(phase === 'cards' || phase === 'selected') && (
                      <motion.div
                        className='grid gap-3 pt-2 sm:grid-cols-3'
                        initial='hidden'
                        animate='visible'
                        exit='exit'
                        variants={{
                          hidden: {},
                          visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
                          exit: { transition: { staggerChildren: 0.05 } }
                        }}
                      >
                        {GOALS.map((goal, idx) => {
                          const isSelected = selectedGoal === goal.id
                          const isOther = selectedGoal !== null && !isSelected

                          return (
                            <motion.button
                              key={goal.id}
                              onClick={() => phase === 'cards' && handleSelect(goal)}
                              disabled={phase === 'selected'}
                              variants={{
                                hidden: { opacity: 0, y: 24, scale: 0.9, rotateX: 15 },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  rotateX: 0,
                                  transition: {
                                    type: 'spring',
                                    stiffness: 180,
                                    damping: 18,
                                    mass: 0.8
                                  }
                                },
                                exit: { opacity: 0, y: -8, scale: 0.9, transition: { duration: 0.15 } }
                              }}
                              whileHover={
                                phase === 'cards'
                                  ? {
                                      y: -6,
                                      scale: 1.04,
                                      transition: { type: 'spring', stiffness: 500, damping: 15 }
                                    }
                                  : undefined
                              }
                              whileTap={phase === 'cards' ? { scale: 0.96, y: 0 } : undefined}
                              animate={
                                isSelected
                                  ? {
                                      scale: 1.06,
                                      y: -4,
                                      transition: { type: 'spring', stiffness: 300, damping: 15 }
                                    }
                                  : isOther
                                    ? { opacity: 0.2, scale: 0.92, y: 4, filter: 'blur(1px)' }
                                    : undefined
                              }
                              className={`group relative flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-colors ${
                                phase === 'cards' ? 'cursor-pointer bg-card/80 backdrop-blur-sm hover:bg-card' : 'bg-card/80'
                              } ${isSelected ? 'border-foreground bg-card shadow-lg' : 'border-border/50'}`}
                            >
                              {/* Glow effect on hover */}
                              <motion.div
                                className='pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity group-hover:opacity-100'
                                style={{
                                  background: 'radial-gradient(circle at 50% 0%, var(--foreground) 0%, transparent 70%)',
                                  opacity: 0.03
                                }}
                              />

                              <motion.div
                                className='relative flex size-11 items-center justify-center rounded-xl bg-foreground text-background'
                                animate={
                                  phase === 'cards' && !isSelected
                                    ? {
                                        y: [0, -3, 0],
                                      }
                                    : undefined
                                }
                                transition={{
                                  duration: 3,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                  delay: idx * 0.4
                                }}
                              >
                                <goal.icon className='size-5' strokeWidth={1.5} />
                              </motion.div>

                              <div className='relative'>
                                <span className='text-sm font-semibold block'>{goal.label}</span>
                                <span className='text-[11px] text-muted-foreground mt-0.5 block'>{goal.sub}</span>
                              </div>

                              {/* Selection indicator */}
                              {isSelected && (
                                <motion.div
                                  className='absolute -bottom-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-foreground'
                                  layoutId='selected-indicator'
                                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                />
                              )}
                            </motion.button>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Selected feedback - user message appears */}
                  <AnimatePresence>
                    {phase === 'selected' && selectedGoal && (
                      <motion.div
                        className='flex justify-end'
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.3 }}
                      >
                        <div className='max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3'>
                          <p className='text-sm text-primary-foreground'>
                            {GOALS.find(g => g.id === selectedGoal)?.message}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
              </Card>

              {/* Sub text */}
              <p className='mt-4 text-center text-sm text-muted-foreground'>
                Sem formulario, sem corretor -- 100% IA
              </p>
            </MotionPreset>
          </div>
        </div>
      </div>
    </section>
  )
}

export { HeroSection25 }
export default HeroSection25
