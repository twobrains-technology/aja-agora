import type { ReactNode } from 'react'

import { XIcon } from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu'

type Props = {
  trigger: ReactNode
  defaultOpen?: boolean
  align?: 'start' | 'center' | 'end'
}

const NotificationDropdown = ({ trigger, defaultOpen, align = 'end' }: Props) => {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger render={<>{trigger}</>} />
      <DropdownMenuContent className='max-w-xs sm:max-w-96' align={align || 'end'}>
        <DropdownMenuLabel className='flex items-center justify-between gap-6 px-4 py-2.5 font-normal'>
          <span className='text-muted-foreground text-base font-normal uppercase'>Notificacoes</span>
          <Badge variant='secondary' className='bg-primary/10 text-primary font-normal'>
            0 Novas
          </Badge>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem className='gap-3 px-4 py-4 text-base'>
          <Avatar className='size-9.5'>
            <AvatarFallback className='bg-primary/10 text-primary text-xs'>AA</AvatarFallback>
          </Avatar>
          <div className='flex w-full flex-col items-start'>
            <span className='text-sm font-medium'>Nenhuma notificacao</span>
            <span className='text-muted-foreground text-xs'>Voce esta em dia!</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default NotificationDropdown
