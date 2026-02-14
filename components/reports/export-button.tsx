'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type ExportButtonProps = {
    data: any[]
    filename: string
    columns: { key: string; label: string }[]
}

export function ExportButton({ data, filename, columns }: ExportButtonProps) {
    const exportToCSV = () => {
        if (!data || data.length === 0) {
            alert('No data to export')
            return
        }

        // Create CSV header
        const headers = columns.map((col) => col.label).join(',')

        // Create CSV rows
        const rows = data.map((row) =>
            columns.map((col) => {
                const value = row[col.key]
                // Escape commas and quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`
                }
                return value ?? ''
            }).join(',')
        )

        // Combine header and rows
        const csv = [headers, ...rows].join('\n')

        // Create blob and download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.setAttribute('href', url)
        link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToCSV}>
                    Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => window.print()}>
                    Print / PDF
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
