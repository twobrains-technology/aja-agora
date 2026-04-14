'use client'

import { useEffect, useState } from 'react'
import { useMedia } from 'react-use'
import Link from 'next/link'
import { MenuIcon, XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList
} from '@/components/ui/navigation-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'

import { cn } from '@/lib/utils'

import Logo from '@/components/shadcn-studio/logo'

export type NavigationItem = {
  title: string
  href: string
  children?: { title: string; description: string; href: string }[]
}

type HeroNavigationProps = {
  navigationItems: NavigationItem[]
  actions?: React.ReactNode
  className?: string
}

const HeroNavigation = ({ navigationItems, actions, className }: HeroNavigationProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const isDesktop = useMedia('(min-width: 768px)', false)

  useEffect(() => {
    if (isDesktop) setIsOpen(false)
  }, [isDesktop])

  return (
    <header className={cn('w-full z-50', className)}>
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8'>
        {/* Logo */}
        <Link href='/'>
          <Logo className='gap-3' />
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className='max-md:hidden'>
          <NavigationMenuList className='flex-wrap justify-start gap-0'>
            {navigationItems.map(item => (
              <NavigationMenuItem key={item.title}>
                {item.children ? (
                  <Collapsible>
                    <CollapsibleTrigger className='text-muted-foreground hover:text-primary px-3 py-1.5 text-base font-medium'>
                      {item.title}
                    </CollapsibleTrigger>
                    <CollapsibleContent className='absolute top-full left-0 mt-1 rounded-md border bg-popover p-2 shadow-md'>
                      {item.children.map(child => (
                        <a
                          key={child.href}
                          href={child.href}
                          className='block rounded-sm px-3 py-2 text-sm hover:bg-muted'
                        >
                          <div className='font-medium'>{child.title}</div>
                          <div className='text-muted-foreground text-xs'>{child.description}</div>
                        </a>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ) : (
                  <NavigationMenuLink
                    href={item.href}
                    className='text-muted-foreground hover:text-primary px-3 py-1.5 text-base! font-medium hover:bg-transparent'
                  >
                    {item.title}
                  </NavigationMenuLink>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Desktop Actions */}
        <div className='max-md:hidden flex items-center gap-3'>
          {actions}
        </div>

        {/* Mobile Sheet */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger
            className='md:hidden'
            render={<Button variant='outline' size='icon' />}
          >
            <MenuIcon />
            <span className='sr-only'>Menu</span>
          </SheetTrigger>
          <SheetContent side='right' className='w-[300px] sm:w-[350px]'>
            <SheetHeader>
              <SheetTitle>
                <Logo />
              </SheetTitle>
            </SheetHeader>
            <nav className='flex flex-col gap-1 pt-6'>
              {navigationItems.map(item => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className='text-muted-foreground hover:text-foreground rounded-md px-3 py-2 text-base font-medium transition-colors hover:bg-muted'
                >
                  {item.title}
                </a>
              ))}
              <div className='mt-4 flex flex-col gap-2 px-3'>
                {actions}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}

export default HeroNavigation
