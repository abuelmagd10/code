import React from 'react'

interface PrintHeaderProps {
    companyName?: string
    companyLogo?: string
    companyAddress?: string
    companyPhone?: string
    companyEmail?: string
    taxId?: string
    title?: string
    subTitle?: string
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
    companyName,
    companyLogo,
    companyAddress,
    companyPhone,
    companyEmail,
    taxId,
    title,
    subTitle
}) => {
    return (
        <div className="print-header-container mb-6 border-b pb-4">
            <div className="flex justify-between items-start">
                {/* Right Side: Company Info (RTL) */}
                <div className="flex flex-col text-right">
                    {companyName && <h1 className="text-xl font-bold text-primary mb-1">{companyName}</h1>}
                    {companyAddress && <p className="text-sm text-gray-600">{companyAddress}</p>}
                    <div className="flex flex-col gap-1 mt-1 text-sm text-gray-600">
                        {companyPhone && <span>{companyPhone}</span>}
                        {companyEmail && <span>{companyEmail}</span>}
                        {taxId && <span className="font-semibold">Tax ID: {taxId}</span>}
                    </div>
                </div>

                {/* Center: Document Title */}
                <div className="text-center flex-1 px-4">
                    {title && <h2 className="text-2xl font-bold text-gray-900 border-2 border-gray-900 inline-block px-4 py-1 rounded">{title}</h2>}
                    {subTitle && <p className="text-md text-gray-500 mt-1">{subTitle}</p>}
                </div>

                {/* Left Side: Logo */}
                <div className="flex-shrink-0">
                    {companyLogo ? (
                        <img
                            src={companyLogo}
                            alt="Company Logo"
                            className="h-24 w-auto object-contain"
                        />
                    ) : (
                        <div className="h-24 w-24 bg-gray-100 flex items-center justify-center text-gray-400 rounded">
                            Logo
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
