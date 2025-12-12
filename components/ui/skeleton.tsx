import React from 'react'
import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  lines?: number
  height?: 'sm' | 'md' | 'lg' | 'xl'
  width?: 'full' | 'half' | 'third' | 'quarter' | number
}

const heightClasses = {
  sm: 'h-4',
  md: 'h-8',
  lg: 'h-12',
  xl: 'h-16'
}

const widthClasses = {
  full: 'w-full',
  half: 'w-1/2',
  third: 'w-1/3',
  quarter: 'w-1/4'
}

export function Skeleton({ 
  className, 
  lines = 1, 
  height = 'md', 
  width = 'full',
  ...props 
}: SkeletonProps) {
  const heightClass = heightClasses[height]
  const widthClass = typeof width === 'string' ? widthClasses[width] : `w-[${width}px]`
  
  if (lines > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'animate-pulse rounded-md bg-muted',
              heightClass,
              i === lines - 1 && lines > 1 ? 'w-3/4' : widthClass,
              className
            )}
            {...props}
          />
        ))}
      </div>
    )
  }
  
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        heightClass,
        widthClass,
        className
      )}
      {...props}
    />
  )
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
      <div className="space-y-3">
        <Skeleton height="lg" width="third" />
        <Skeleton lines={lines} />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="p-4 border-b">
        <Skeleton width="quarter" height="lg" />
      </div>
      <div className="p-4">
        <div className="space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex space-x-4">
              {Array.from({ length: cols }).map((_, j) => (
                <Skeleton key={j} className="flex-1" height="md" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton width="quarter" height="sm" />
          <Skeleton height="lg" />
        </div>
      ))}
      <div className="flex space-x-4">
        <Skeleton width={20} height="lg" />
        <Skeleton width={20} height="lg" />
      </div>
    </div>
  )
}

export function StatsCardSkeleton() {
  return (
    <CardSkeleton lines={2} />
  )
}

export function ChartSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6">
      <Skeleton width="third" height="lg" className="mb-6" />
      <div className="h-64 bg-muted rounded-md animate-pulse" />
    </div>
  )
}

export function ListItemSkeleton({ avatar = false }: { avatar?: boolean }) {
  return (
    <div className="flex items-center space-x-4 p-4 border-b last:border-b-0">
      {avatar && <Skeleton className="w-12 h-12 rounded-full" />}
      <div className="flex-1 space-y-2">
        <Skeleton width="third" height="sm" />
        <Skeleton width="half" height="sm" />
      </div>
      <Skeleton width={20} height="sm" />
    </div>
  )
}

export function ListSkeleton({ items = 5, avatar = false }: { items?: number; avatar?: boolean }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="p-4 border-b">
        <Skeleton width="quarter" height="lg" />
      </div>
      <div>
        {Array.from({ length: items }).map((_, i) => (
          <ListItemSkeleton key={i} avatar={avatar} />
        ))}
      </div>
    </div>
  )
}