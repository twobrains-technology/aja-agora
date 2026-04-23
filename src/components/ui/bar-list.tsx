'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type Bar<T> = T & {
  key?: string
  value: number
  name: string
  barClassName?: string
}

interface BarListProps<T = unknown> extends React.ComponentProps<'div'> {
  data: Bar<T>[]
  valueFormatter?: (value: number) => string
  showAnimation?: boolean
  onValueChange?: (payload: Bar<T>) => void
  sortOrder?: 'ascending' | 'descending' | 'none'
  barClassName?: string
  labelClassName?: string
  barGap?: number
  barHeight?: number
}

function BarListInner<T>(
  {
    data = [],
    valueFormatter = value => value.toString(),
    showAnimation = false,
    onValueChange,
    sortOrder = 'descending',
    barClassName,
    labelClassName,
    barGap = 6,
    barHeight = 32,
    className,
    ...props
  }: BarListProps<T>,
  forwardedRef: React.ForwardedRef<HTMLDivElement>
) {
  const Component = onValueChange ? 'button' : 'div'

  const sortedData = React.useMemo(() => {
    if (sortOrder === 'none') return data
    return [...data].sort((a, b) => sortOrder === 'ascending' ? a.value - b.value : b.value - a.value)
  }, [data, sortOrder])

  const widths = React.useMemo(() => {
    const maxValue = Math.max(...sortedData.map(item => item.value), 0)
    return sortedData.map(item => (item.value === 0 ? 0 : Math.max((item.value / maxValue) * 100, 2)))
  }, [sortedData])

  return (
    <div ref={forwardedRef} data-slot='bar-list' className={cn('flex justify-between space-x-6', className)} aria-sort={sortOrder} {...props}>
      <div className='relative w-full' style={{ gap: `${barGap}px`, display: 'flex', flexDirection: 'column' }}>
        {sortedData.map((item, index) => (
          <Component
            key={item.key ?? item.name}
            onClick={onValueChange ? () => onValueChange(item) : undefined}
            className={cn(
              'group w-full rounded-md text-left',
              onValueChange ? 'cursor-pointer' : '',
            )}
            style={{ height: `${barHeight}px` }}
          >
            <div
              className={cn(
                'flex items-center rounded-md px-2 h-full transition-all',
                showAnimation ? 'duration-800' : '',
                item.barClassName ?? barClassName ?? 'bg-primary/15 dark:bg-primary/25',
              )}
              style={{ width: `${widths[index]}%` }}
            >
              <span className={cn('truncate text-sm', labelClassName)}>{item.name}</span>
            </div>
          </Component>
        ))}
      </div>
      <div style={{ gap: `${barGap}px`, display: 'flex', flexDirection: 'column' }}>
        {sortedData.map(item => (
          <div key={item.key ?? item.name} className='flex items-center justify-end' style={{ height: `${barHeight}px` }}>
            <span className='text-sm font-medium tabular-nums text-foreground'>{valueFormatter(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const BarList = React.forwardRef(BarListInner) as <T>(
  props: BarListProps<T> & React.RefAttributes<HTMLDivElement>
) => React.ReactElement

export { BarList, type BarListProps }
