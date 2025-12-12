import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Find account ID by search criteria
 * Utility function to find account IDs based on sub_type or name patterns
 */
export function findAccountId(accounts: any[], criteria: {
  subType?: string;
  nameIncludes?: string[];
  namePatterns?: string[];
}): string | undefined {
  if (!accounts || accounts.length === 0) return undefined;
  
  const find = (f: (a: any) => boolean) => accounts.find(f)?.id;
  
  // Try sub_type match first
  if (criteria.subType) {
    const result = find((a: any) => 
      String(a.sub_type || "").toLowerCase() === String(criteria.subType).toLowerCase()
    );
    if (result) return result;
  }
  
  // Try name includes patterns
  if (criteria.nameIncludes) {
    for (const pattern of criteria.nameIncludes) {
      const result = find((a: any) => 
        String(a.account_name || "").toLowerCase().includes(pattern.toLowerCase())
      );
      if (result) return result;
    }
  }
  
  // Try exact name patterns
  if (criteria.namePatterns) {
    for (const pattern of criteria.namePatterns) {
      const result = find((a: any) => 
        String(a.account_name || "").toLowerCase() === pattern.toLowerCase()
      );
      if (result) return result;
    }
  }
  
  return undefined;
}

/**
 * Common account type finders
 */
export const AccountFinders = {
  customerAdvance: (accounts: any[]) => findAccountId(accounts, {
    subType: 'customer_advance',
    nameIncludes: ['advance', 'deposit']
  }),
  
  cash: (accounts: any[]) => findAccountId(accounts, {
    subType: 'cash',
    nameIncludes: ['cash']
  }),
  
  bank: (accounts: any[]) => findAccountId(accounts, {
    subType: 'bank',
    nameIncludes: ['bank']
  })
} as const;
