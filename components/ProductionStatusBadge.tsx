import { Badge } from '@/components/ui/badge'
import { CheckCircle, Shield, Database } from 'lucide-react'

export const ProductionStatusBadge = () => (
  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
    <CheckCircle className="w-5 h-5 text-green-600" />
    <div className="flex items-center gap-2">
      <Badge className="bg-green-600 hover:bg-green-700">
        PRODUCTION READY
      </Badge>
      <Badge variant="outline" className="border-green-300 text-green-700">
        <Shield className="w-3 h-3 mr-1" />
        Enterprise Grade
      </Badge>
      <Badge variant="outline" className="border-blue-300 text-blue-700">
        <Database className="w-3 h-3 mr-1" />
        Audit Ready
      </Badge>
    </div>
  </div>
)