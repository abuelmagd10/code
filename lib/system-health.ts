/**
 * System health check utilities
 * للتحقق من حالة النظام وإعدادات Supabase
 */

export interface SystemHealth {
  supabase: {
    configured: boolean
    url: string | null
    hasValidKeys: boolean
    isDummy: boolean
  }
  environment: {
    nodeEnv: string
    isDevelopment: boolean
    isProduction: boolean
  }
  status: 'healthy' | 'warning' | 'error'
  issues: string[]
}

/**
 * Check if Supabase is properly configured
 */
export function checkSupabaseConfig(): SystemHealth['supabase'] {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  const configured = !!(supabaseUrl && supabaseAnonKey)
  const isDummy = !!(supabaseUrl?.includes('dummy') || supabaseAnonKey?.includes('dummy'))
  const hasValidKeys = configured && !isDummy

  return {
    configured,
    url: supabaseUrl || null,
    hasValidKeys,
    isDummy
  }
}

/**
 * Get environment information
 */
export function getEnvironmentInfo(): SystemHealth['environment'] {
  const nodeEnv = process.env.NODE_ENV || 'development'
  
  return {
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production'
  }
}

/**
 * Perform comprehensive system health check
 */
export function performHealthCheck(): SystemHealth {
  const supabase = checkSupabaseConfig()
  const environment = getEnvironmentInfo()
  const issues: string[] = []
  
  // Check for issues
  if (!supabase.configured) {
    issues.push('Supabase environment variables are missing')
  } else if (supabase.isDummy) {
    issues.push('Supabase is using dummy/placeholder values')
  }
  
  // Determine overall status
  let status: SystemHealth['status'] = 'healthy'
  
  if (issues.length > 0) {
    if (supabase.isDummy) {
      status = 'warning'
    } else {
      status = 'error'
    }
  }
  
  return {
    supabase,
    environment,
    status,
    issues
  }
}

/**
 * Get user-friendly error messages
 */
export function getHealthMessages(health: SystemHealth, lang: 'ar' | 'en' = 'ar') {
  const messages = {
    ar: {
      supabaseNotConfigured: 'لم يتم إعداد Supabase بعد',
      supabaseDummyConfig: 'Supabase يستخدم إعدادات وهمية',
      systemHealthy: 'النظام يعمل بشكل طبيعي',
      needsConfiguration: 'يحتاج النظام إلى إعداد'
    },
    en: {
      supabaseNotConfigured: 'Supabase is not configured',
      supabaseDummyConfig: 'Supabase is using dummy configuration',
      systemHealthy: 'System is healthy',
      needsConfiguration: 'System needs configuration'
    }
  }
  
  const t = messages[lang]
  const result: string[] = []
  
  if (health.status === 'healthy') {
    result.push(t.systemHealthy)
  } else {
    if (!health.supabase.configured) {
      result.push(t.supabaseNotConfigured)
    } else if (health.supabase.isDummy) {
      result.push(t.supabaseDummyConfig)
    }
  }
  
  return result
}