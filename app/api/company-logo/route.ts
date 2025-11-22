import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const companyId = String(form.get("company_id") || "")
    if (!file || !companyId) return NextResponse.json({ error: "missing_params" }, { status: 400 })
    const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    if (!url || !key) return NextResponse.json({ error: "missing_env" }, { status: 500 })
    const supabase = createClient(url, key, { global: { headers: { apikey: key } } })
    const buckets = await supabase.storage.listBuckets()
    const hasBucket = (buckets.data || []).some((b) => b.name === "company-logos")
    if (!hasBucket) await supabase.storage.createBucket("company-logos", { public: true, fileSizeLimit: 5242880 })
    const ext = (file.name.split(".").pop() || "png").toLowerCase()
    const path = `${companyId}/logo.${ext}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await supabase.storage.from("company-logos").upload(path, new Uint8Array(arrayBuffer), { upsert: true, contentType: file.type || "image/png" })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path)
    const logoUrl = String((pub as any)?.publicUrl || "")
    await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", companyId)
    return NextResponse.json({ url: logoUrl })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "upload_failed") }, { status: 500 })
  }
}