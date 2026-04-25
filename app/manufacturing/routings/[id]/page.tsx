import { RoutingDetailPage } from "@/components/manufacturing/routing/routing-detail-page"

export default async function ManufacturingRoutingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <RoutingDetailPage routingId={id} />
}
