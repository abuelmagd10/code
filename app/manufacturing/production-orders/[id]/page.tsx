import { ProductionOrderDetailPage } from "@/components/manufacturing/production-order/production-order-detail-page"

export default async function ManufacturingProductionOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProductionOrderDetailPage productionOrderId={id} />
}
