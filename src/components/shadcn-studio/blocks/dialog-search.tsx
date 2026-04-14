'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

import {
  UsersIcon,
  ShoppingCartIcon,
  MonitorSmartphoneIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  Undo2Icon,
  MoreVerticalIcon
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  className?: string
}

const SearchDialog = ({ defaultOpen = false, trigger, className }: Props) => {
  const [open, setOpen] = useState(defaultOpen)
  const [search, setSearch] = useState('')

  return (
    <div className={className}>
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder='Buscar...'
          value={search}
          onValueChange={setSearch}
          className='text-base [svg:has(+&)]:size-5 [svg:has(+&)]:opacity-100'
        />

        <CommandList className='max-h-[65vh]'>
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>

          <CommandGroup
            heading='Sugestoes'
            className='[&_[cmdk-group-heading]]:text-muted-foreground !px-4 !py-6 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:uppercase'
          >
            <CommandItem onSelect={() => setOpen(false)} className='!py-1.5 text-base'>
              <UsersIcon className='text-foreground !size-4.5' />
              <span>Dashboard</span>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)} className='!py-1.5 text-base'>
              <ShoppingCartIcon className='text-foreground !size-4.5' />
              <span>Pipeline</span>
            </CommandItem>
            <CommandItem onSelect={() => setOpen(false)} className='!py-1.5 text-base'>
              <MonitorSmartphoneIcon className='text-foreground !size-4.5' />
              <span>Conversas</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>

        <CommandSeparator />

        <div className='text-muted-foreground flex flex-wrap items-center gap-4 p-6'>
          <div className='flex flex-1 items-center gap-2'>
            <kbd className='rounded border px-1 text-sm'>esc</kbd>
            <span>Para fechar</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex size-5 items-center justify-center rounded border'>
              <Undo2Icon className='size-4' />
            </div>
            <span>Para selecionar</span>
          </div>
          <div className='flex items-center gap-2'>
            <div className='flex size-5 items-center justify-center rounded border'>
              <ArrowUpIcon className='size-4' />
            </div>
            <div className='flex size-5 items-center justify-center rounded border'>
              <ArrowDownIcon className='size-4' />
            </div>
            <span>Para navegar</span>
          </div>
        </div>
      </CommandDialog>
    </div>
  )
}

export default SearchDialog
