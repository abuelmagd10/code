import { BomDetailPage } from "@/components/manufacturing/bom/bom-detail-page"

export default async function ManufacturingBomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <BomDetailPage bomId={id} />
}
