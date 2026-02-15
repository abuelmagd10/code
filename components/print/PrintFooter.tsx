import React from 'react'

interface PrintFooterProps {
    printedBy?: string
    printDate?: string
    pageNumber?: boolean
}

export const PrintFooter: React.FC<PrintFooterProps> = ({
    printedBy,
    printDate = new Date().toLocaleString(),
    pageNumber = true
}) => {
    return (
        <div className="print-footer-container mt-auto pt-4 border-t text-xs text-gray-500 flex justify-between items-center bg-white">
            <div>
                {printedBy && <span>Printed by: {printedBy}</span>}
            </div>
            <div>
                <span>Printed on: {printDate}</span>
            </div>
            {pageNumber && (
                <div className="page-number">
                    {/* Usually page numbers are handled by the browser/printer, but we can add a placeholder if needed */}
                    {/* CSS counters can be used for page numbers in print media if supported */}
                </div>
            )}
        </div>
    )
}
