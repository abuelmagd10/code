import { format } from 'date-fns'

interface ReportHeaderProps {
    title: string
    subtitle?: string
    startDate?: Date | string
    endDate?: Date | string
    asOfDate?: Date | string
    companyName?: string
}

export function ReportHeader({
    title,
    subtitle,
    startDate,
    endDate,
    asOfDate,
    companyName = 'My Company' // Ideally fetch this
}: ReportHeaderProps) {
    const formatDate = (date: Date | string) => {
        if (!date) return ''
        return format(new Date(date), 'MMMM dd, yyyy')
    }

    return (
        <div className="mb-8 text-center print:text-left">
            <h2 className="text-2xl font-bold tracking-tight">{companyName}</h2>
            <h1 className="text-3xl font-bold mt-2 text-primary">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}

            <div className="mt-4 text-sm text-muted-foreground">
                {asOfDate ? (
                    <p>As of {formatDate(asOfDate)}</p>
                ) : startDate && endDate ? (
                    <p>Period: {formatDate(startDate)} to {formatDate(endDate)}</p>
                ) : null}
            </div>
        </div>
    )
}
