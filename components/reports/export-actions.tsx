'use client'

import { Button } from '@/components/ui/button'
import { Download, Printer } from 'lucide-react'

interface ExportButtonProps {
    onExportCSV?: () => void
    onPrint?: () => void
    disabled?: boolean
}

export function ExportActions({ onExportCSV, onPrint, disabled }: ExportButtonProps) {
    return (
        <div className="flex gap-2">
            {onExportCSV && (
                <Button variant="outline" size="sm" onClick={onExportCSV} disabled={disabled}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                </Button>
            )}
            {onPrint && (
                <Button variant="outline" size="sm" onClick={onPrint} disabled={disabled}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                </Button>
            )}
        </div>
    )
}
