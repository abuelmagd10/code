import { Sidebar } from "@/components/sidebar"
import { TooltipManager } from "@/components/TooltipManager"
import { TooltipExamples } from "@/components/TooltipExamples"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const dynamic = "force-dynamic"

export default async function TooltipsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="manager" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manager">إدارة التلميحات</TabsTrigger>
              <TabsTrigger value="examples">أمثلة تفاعلية</TabsTrigger>
            </TabsList>
            
            <TabsContent value="manager">
              <TooltipManager />
            </TabsContent>
            
            <TabsContent value="examples">
              <TooltipExamples />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  )
}