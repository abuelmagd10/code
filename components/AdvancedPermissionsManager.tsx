import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, Users, Lock, CheckCircle, AlertTriangle, Clock } from 'lucide-react'
import { useSupabase } from '@/lib/supabase/hooks'
import { getActiveCompanyId } from '@/lib/company'

interface AdvancedPermission {
  id: string
  userId: string
  userName: string
  permissionType: string
  resourceType: string
  branchId?: string
  branchName?: string
  costCenterId?: string
  costCenterName?: string
  canViewPrices: boolean
  canViewCosts: boolean
  canApprove: boolean
  canPost: boolean
  maxAmount?: number
  expiresAt?: string
  isActive: boolean
}

interface PeriodLock {
  id: string
  periodYear: number
  periodMonth: number
  periodName: string
  startDate: string
  endDate: string
  status: 'open' | 'closed' | 'locked'
  closedBy?: string
  closedAt?: string
}

export const AdvancedPermissionsManager = ({ lang }: { lang: 'ar' | 'en' }) => {
  const supabase = useSupabase()
  const [permissions, setPermissions] = useState<AdvancedPermission[]>([])
  const [periods, setPeriods] = useState<PeriodLock[]>([])
  const [users, setUsers] = useState<Array<{ id: string, name: string }>>([])
  const [branches, setBranches] = useState<Array<{ id: string, name: string }>>([])
  const [costCenters, setCostCenters] = useState<Array<{ id: string, name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'permissions' | 'periods'>('permissions')

  // نموذج إضافة صلاحية جديدة
  const [newPermission, setNewPermission] = useState({
    userId: '',
    permissionType: '',
    resourceType: '',
    branchId: '',
    costCenterId: '',
    canViewPrices: false,
    canViewCosts: false,
    canApprove: false,
    canPost: false,
    maxAmount: '',
    expiresAt: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // تحميل الصلاحيات
      const { data: permissionsData } = await supabase
        .from('advanced_permissions')
        .select(`
          *,
          user_profiles!user_id(display_name),
          branches!branch_id(name),
          cost_centers!cost_center_id(cost_center_name)
        `)
        .eq('company_id', companyId)
        .eq('is_active', true)

      setPermissions(permissionsData?.map(p => ({
        id: p.id,
        userId: p.user_id,
        userName: p.user_profiles?.display_name || 'Unknown',
        permissionType: p.permission_type,
        resourceType: p.resource_type,
        branchId: p.branch_id,
        branchName: p.branches?.name,
        costCenterId: p.cost_center_id,
        costCenterName: p.cost_centers?.cost_center_name,
        canViewPrices: p.can_view_prices,
        canViewCosts: p.can_view_costs,
        canApprove: p.can_approve,
        canPost: p.can_post,
        maxAmount: p.max_amount,
        expiresAt: p.expires_at,
        isActive: p.is_active
      })) || [])

      // تحميل الفترات المحاسبية
      const { data: periodsData } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('company_id', companyId)
        .order('period_year DESC, period_month DESC')

      setPeriods(periodsData || [])

      // تحميل المستخدمين
      const { data: usersData } = await supabase
        .from('company_members')
        .select('user_id, user_profiles!user_id(display_name)')
        .eq('company_id', companyId)

      setUsers(usersData?.map(u => ({
        id: u.user_id,
        name: u.user_profiles?.display_name || 'Unknown'
      })) || [])

      // تحميل الفروع
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('company_id', companyId)

      setBranches(branchesData || [])

      // تحميل مراكز التكلفة
      const { data: costCentersData } = await supabase
        .from('cost_centers')
        .select('id, name')
        .eq('company_id', companyId)

      setCostCenters(costCentersData || [])

    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const addPermission = async () => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { error } = await supabase
        .from('advanced_permissions')
        .insert({
          company_id: companyId,
          user_id: newPermission.userId,
          permission_type: newPermission.permissionType,
          resource_type: newPermission.resourceType,
          branch_id: newPermission.branchId || null,
          cost_center_id: newPermission.costCenterId || null,
          can_view_prices: newPermission.canViewPrices,
          can_view_costs: newPermission.canViewCosts,
          can_approve: newPermission.canApprove,
          can_post: newPermission.canPost,
          max_amount: newPermission.maxAmount ? parseFloat(newPermission.maxAmount) : null,
          expires_at: newPermission.expiresAt || null
        })

      if (error) throw error

      // إعادة تعيين النموذج
      setNewPermission({
        userId: '',
        permissionType: '',
        resourceType: '',
        branchId: '',
        costCenterId: '',
        canViewPrices: false,
        canViewCosts: false,
        canApprove: false,
        canPost: false,
        maxAmount: '',
        expiresAt: ''
      })

      loadData()
    } catch (error) {
      console.error('Error adding permission:', error)
    }
  }

  const togglePeriodStatus = async (periodId: string, newStatus: 'open' | 'closed' | 'locked') => {
    try {
      const { error } = await supabase
        .from('accounting_periods')
        .update({
          status: newStatus,
          [`${newStatus}_by`]: (await supabase.auth.getUser()).data.user?.id,
          [`${newStatus}_at`]: new Date().toISOString()
        })
        .eq('id', periodId)

      if (error) throw error
      loadData()
    } catch (error) {
      console.error('Error updating period:', error)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'closed': return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'locked': return <Lock className="w-4 h-4 text-red-500" />
      default: return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  if (loading) {
    return <div className="p-8 text-center">{lang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>
  }

  return (
    <div className="space-y-6">
      {/* رأس الصفحة */}
      <div className="flex items-center gap-4">
        <Shield className="w-8 h-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">
            {lang === 'en' ? 'Advanced Permissions & Period Management' : 'إدارة الصلاحيات المتقدمة والفترات'}
          </h1>
          <p className="text-gray-500">
            {lang === 'en' ? 'Manage user permissions and accounting periods' : 'إدارة صلاحيات المستخدمين والفترات المحاسبية'}
          </p>
        </div>
      </div>

      {/* تبويبات */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === 'permissions' ? 'default' : 'outline'}
          onClick={() => setActiveTab('permissions')}
        >
          <Users className="w-4 h-4 mr-2" />
          {lang === 'en' ? 'Permissions' : 'الصلاحيات'}
        </Button>
        <Button
          variant={activeTab === 'periods' ? 'default' : 'outline'}
          onClick={() => setActiveTab('periods')}
        >
          <Lock className="w-4 h-4 mr-2" />
          {lang === 'en' ? 'Period Locks' : 'قفل الفترات'}
        </Button>
      </div>

      {/* إدارة الصلاحيات */}
      {activeTab === 'permissions' && (
        <div className="space-y-6">
          {/* نموذج إضافة صلاحية */}
          <Card>
            <CardHeader>
              <CardTitle>{lang === 'en' ? 'Add New Permission' : 'إضافة صلاحية جديدة'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <Select value={newPermission.userId} onValueChange={(value) => setNewPermission(prev => ({ ...prev, userId: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'en' ? 'Select User' : 'اختر المستخدم'} />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={newPermission.permissionType} onValueChange={(value) => setNewPermission(prev => ({ ...prev, permissionType: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'en' ? 'Permission Type' : 'نوع الصلاحية'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">{lang === 'en' ? 'View' : 'عرض'}</SelectItem>
                    <SelectItem value="edit">{lang === 'en' ? 'Edit' : 'تعديل'}</SelectItem>
                    <SelectItem value="approve">{lang === 'en' ? 'Approve' : 'موافقة'}</SelectItem>
                    <SelectItem value="post">{lang === 'en' ? 'Post' : 'ترحيل'}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={newPermission.resourceType} onValueChange={(value) => setNewPermission(prev => ({ ...prev, resourceType: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === 'en' ? 'Resource Type' : 'نوع المورد'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoices">{lang === 'en' ? 'Invoices' : 'الفواتير'}</SelectItem>
                    <SelectItem value="bills">{lang === 'en' ? 'Bills' : 'فواتير الشراء'}</SelectItem>
                    <SelectItem value="payments">{lang === 'en' ? 'Payments' : 'المدفوعات'}</SelectItem>
                    <SelectItem value="journal_entries">{lang === 'en' ? 'Journal Entries' : 'القيود'}</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  placeholder={lang === 'en' ? 'Max Amount' : 'الحد الأقصى'}
                  value={newPermission.maxAmount}
                  onChange={(e) => setNewPermission(prev => ({ ...prev, maxAmount: e.target.value }))}
                />

                <Button onClick={addPermission} disabled={!newPermission.userId || !newPermission.permissionType}>
                  {lang === 'en' ? 'Add Permission' : 'إضافة صلاحية'}
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={newPermission.canViewPrices}
                    onCheckedChange={(checked) => setNewPermission(prev => ({ ...prev, canViewPrices: checked }))}
                  />
                  <label className="text-sm">{lang === 'en' ? 'View Prices' : 'عرض الأسعار'}</label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={newPermission.canViewCosts}
                    onCheckedChange={(checked) => setNewPermission(prev => ({ ...prev, canViewCosts: checked }))}
                  />
                  <label className="text-sm">{lang === 'en' ? 'View Costs' : 'عرض التكاليف'}</label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={newPermission.canApprove}
                    onCheckedChange={(checked) => setNewPermission(prev => ({ ...prev, canApprove: checked }))}
                  />
                  <label className="text-sm">{lang === 'en' ? 'Can Approve' : 'يمكن الموافقة'}</label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={newPermission.canPost}
                    onCheckedChange={(checked) => setNewPermission(prev => ({ ...prev, canPost: checked }))}
                  />
                  <label className="text-sm">{lang === 'en' ? 'Can Post' : 'يمكن الترحيل'}</label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* قائمة الصلاحيات */}
          <Card>
            <CardHeader>
              <CardTitle>{lang === 'en' ? 'Current Permissions' : 'الصلاحيات الحالية'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">{lang === 'en' ? 'User' : 'المستخدم'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Permission' : 'الصلاحية'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Resource' : 'المورد'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Scope' : 'النطاق'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Capabilities' : 'القدرات'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Max Amount' : 'الحد الأقصى'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map(permission => (
                      <tr key={permission.id} className="border-b">
                        <td className="p-2">{permission.userName}</td>
                        <td className="p-2">
                          <Badge variant="outline">{permission.permissionType}</Badge>
                        </td>
                        <td className="p-2">{permission.resourceType}</td>
                        <td className="p-2">
                          {permission.branchName && <Badge variant="secondary">{permission.branchName}</Badge>}
                          {permission.costCenterName && <Badge variant="secondary">{permission.costCenterName}</Badge>}
                        </td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            {permission.canViewPrices && <Badge variant="outline">Prices</Badge>}
                            {permission.canViewCosts && <Badge variant="outline">Costs</Badge>}
                            {permission.canApprove && <Badge variant="outline">Approve</Badge>}
                            {permission.canPost && <Badge variant="outline">Post</Badge>}
                          </div>
                        </td>
                        <td className="p-2">{permission.maxAmount?.toLocaleString() || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* إدارة الفترات */}
      {activeTab === 'periods' && (
        <div className="space-y-6">
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              {lang === 'en'
                ? 'Closed periods prevent new transactions. Locked periods cannot be reopened without super admin access.'
                : 'الفترات المقفلة تمنع المعاملات الجديدة. الفترات المؤمنة لا يمكن إعادة فتحها بدون صلاحية المدير العام.'}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>{lang === 'en' ? 'Accounting Periods' : 'الفترات المحاسبية'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">{lang === 'en' ? 'Period' : 'الفترة'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Date Range' : 'النطاق الزمني'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Status' : 'الحالة'}</th>
                      <th className="text-left p-2">{lang === 'en' ? 'Actions' : 'الإجراءات'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map(period => (
                      <tr key={period.id} className="border-b">
                        <td className="p-2 font-medium">{period.periodName}</td>
                        <td className="p-2">{period.startDate} - {period.endDate}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(period.status)}
                            <Badge variant={
                              period.status === 'open' ? 'default' :
                                period.status === 'closed' ? 'secondary' : 'destructive'
                            }>
                              {period.status}
                            </Badge>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            {period.status === 'open' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => togglePeriodStatus(period.id, 'closed')}
                              >
                                {lang === 'en' ? 'Close' : 'إغلاق'}
                              </Button>
                            )}
                            {period.status === 'closed' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => togglePeriodStatus(period.id, 'open')}
                                >
                                  {lang === 'en' ? 'Reopen' : 'إعادة فتح'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => togglePeriodStatus(period.id, 'locked')}
                                >
                                  {lang === 'en' ? 'Lock' : 'تأمين'}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}