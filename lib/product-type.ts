export const PRODUCT_TYPES = [
  "manufactured",
  "raw_material",
  "purchased",
  "service",
] as const

export type ProductType = (typeof PRODUCT_TYPES)[number]
export type CompatItemType = "product" | "service"

const PRODUCT_TYPE_SET = new Set<string>(PRODUCT_TYPES)

export function normalizeProductTypeInput(value: unknown): ProductType | null {
  if (typeof value !== "string") return null

  const normalized = value.trim().toLowerCase()
  if (!PRODUCT_TYPE_SET.has(normalized)) return null

  return normalized as ProductType
}

export function normalizeCompatItemTypeInput(value: unknown): CompatItemType | null {
  if (typeof value !== "string") return null

  const normalized = value.trim().toLowerCase()
  if (normalized === "service") return "service"
  if (normalized === "product") return "product"

  return null
}

export function resolveProductClassification(params: {
  itemType?: unknown
  productType?: unknown
  existingProductType?: unknown
}): { itemType: CompatItemType; productType: ProductType } {
  const explicitProductType = normalizeProductTypeInput(params.productType)
  const explicitItemType = normalizeCompatItemTypeInput(params.itemType)
  const existingProductType = normalizeProductTypeInput(params.existingProductType)

  if (explicitProductType) {
    const canonicalItemType: CompatItemType =
      explicitProductType === "service" ? "service" : "product"

    if (explicitItemType && explicitItemType !== canonicalItemType) {
      throw new Error("item_type must remain consistent with product_type")
    }

    return {
      itemType: canonicalItemType,
      productType: explicitProductType,
    }
  }

  if (explicitItemType === "service") {
    return {
      itemType: "service",
      productType: "service",
    }
  }

  if (existingProductType && existingProductType !== "service") {
    return {
      itemType: "product",
      productType: existingProductType,
    }
  }

  return {
    itemType: "product",
    productType: "purchased",
  }
}
