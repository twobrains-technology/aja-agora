'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import Link from 'next/link'
import {
  Bot,
  Home,
  Car,
  Briefcase,
  Sparkles,
  MessageCircle,
  ArrowRight
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const goals = [
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
    id: 'servicos',
    icon: Briefcase,
    label: 'Servicos',
    sub: 'Reforma ou viagem',
    message: 'Quero fazer um consorcio de servicos, o que voces tem disponivel?',
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
    (goal: (typeof goals)[number]) => {
      setSelectedGoal(goal.id)
      setPhase('selected')
      setTimeout(() => onGoalSelected(goal.message), 800)
    },
    [onGoalSelected]
  )

  return (
    <section className='relative overflow-hidden py-12 md:py-20 lg:py-24'>
      {/* Background glow */}
      <div className='pointer-events-none absolute inset-0 overflow-hidden'>
        <div className='absolute left-1/2 top-1/4 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/5 blur-[120px]' />
        <div className='absolute bottom-1/4 right-1/4 size-[400px] rounded-full bg-blue-400/5 blur-[100px]' />
      </div>

      <div className='relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <div className='grid gap-10 lg:grid-cols-2 lg:gap-16 items-center'>
          {/* Left Column — Text */}
          <div className='flex flex-col gap-6'>
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              <div className='flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-2 backdrop-blur-sm w-fit'>
                <Badge className='gap-1'>
                  <Sparkles className='size-3' />
                  IA
                </Badge>
                <span className='text-muted-foreground text-sm'>Consorcio inteligente</span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15, ease: [0.21, 0.47, 0.32, 0.98] }}
              className='text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl'
            >
              Seu consorcio, do sonho{' '}
              <span className='bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent'>
                a assinatura
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className='text-muted-foreground text-base sm:text-lg max-w-lg'
            >
              Sem formulario, sem corretor. Converse com nosso agente inteligente e encontre o consorcio perfeito para voce em minutos.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className='flex flex-wrap gap-3'
            >
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
            </motion.div>
          </div>

          {/* Right Column — Chat Preview */}
          <motion.div
            className='w-full'
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 100, damping: 20, delay: 0.3 }}
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
                        visible: { transition: { staggerChildren: 0.12 } },
                        exit: { transition: { staggerChildren: 0.05 } }
                      }}
                    >
                      {goals.map(goal => {
                        const isSelected = selectedGoal === goal.id
                        const isOther = selectedGoal !== null && !isSelected

                        return (
                          <motion.button
                            key={goal.id}
                            onClick={() => phase === 'cards' && handleSelect(goal)}
                            disabled={phase === 'selected'}
                            variants={{
                              hidden: { opacity: 0, y: 16, scale: 0.95 },
                              visible: {
                                opacity: 1,
                                y: 0,
                                scale: 1,
                                transition: { type: 'spring', stiffness: 200, damping: 20 }
                              },
                              exit: { opacity: 0, scale: 0.9, transition: { duration: 0.2 } }
                            }}
                            whileHover={
                              phase === 'cards'
                                ? { scale: 1.03, y: -2, transition: { type: 'spring', stiffness: 400, damping: 15 } }
                                : undefined
                            }
                            whileTap={phase === 'cards' ? { scale: 0.97 } : undefined}
                            animate={
                              isSelected
                                ? { scale: 1.05, borderColor: 'var(--primary)' }
                                : isOther
                                  ? { opacity: 0.3, scale: 0.95 }
                                  : undefined
                            }
                            className={`group flex flex-col items-center gap-3 rounded-xl border bg-card p-5 text-center transition-all ${
                              phase === 'cards' ? 'cursor-pointer hover:border-foreground/20 hover:shadow-md' : ''
                            } ${isSelected ? 'border-foreground shadow-md' : ''}`}
                          >
                            <div className='flex size-10 items-center justify-center rounded-lg bg-foreground text-background'>
                              <goal.icon className='size-5' />
                            </div>
                            <div>
                              <span className='text-sm font-semibold block'>{goal.label}</span>
                              <span className='text-xs text-muted-foreground'>{goal.sub}</span>
                            </div>
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
                          {goals.find(g => g.id === selectedGoal)?.message}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* Sub text */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className='mt-4 text-center text-sm text-muted-foreground'
            >
              Sem formulario, sem corretor -- 100% IA
            </motion.p>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

export { HeroSection25 }
export default HeroSection25
