"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// تحميل المكون ديناميكياً لتجنب مشاكل SSR
const AuditLogContent = dynamic(() => import("./AuditLogContent"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">جاري تحميل سجل المراجعة...</p>
      </div>
    </div>
  ),
});

export default function AuditLogPageWrapper() {
  return <AuditLogContent />;
}

