// =============================================
// Bosta Shipping Adapter
// بوسطة - شركة شحن مصرية
// =============================================

import { BaseShippingAdapter } from '../base-adapter'
import type {
  CreateShipmentRequest,
  CreateShipmentResponse,
  TrackShipmentRequest,
  TrackShipmentResponse,
  CancelShipmentRequest,
  CancelShipmentResponse,
  PrintLabelRequest,
  PrintLabelResponse,
} from '../types'

export class BostaAdapter extends BaseShippingAdapter {
  providerCode = 'bosta'

  // خريطة حالات Bosta للحالات الداخلية
  private statusMap: Record<string, string> = {
    'TICKET_CREATED': 'created',
    'PACKAGE_RECEIVED': 'picked_up',
    'IN_TRANSIT': 'in_transit',
    'OUT_FOR_DELIVERY': 'out_for_delivery',
    'DELIVERED': 'delivered',
    'RETURNED_TO_BUSINESS': 'returned',
    'CANCELLED': 'cancelled',
    'DELIVERY_FAILED': 'failed',
  }

  protected async getAuthHeaders(): Promise<Record<string, string>> {
    return {
      'Content-Type': 'application/json',
      'Authorization': this.config.api_key || '',
    }
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    // تحويل البيانات لصيغة Bosta
    const bostaPayload = {
      type: request.shipment.cod_amount ? 10 : 15, // 10 = COD, 15 = Prepaid
      specs: {
        packageDetails: {
          itemsCount: request.shipment.pieces || 1,
          description: request.shipment.description || 'Package',
        },
        weight: request.shipment.weight,
        size: request.shipment.dimensions ? 'CUSTOM' : 'SMALL',
      },
      dropOffAddress: {
        firstLine: request.consignee.address,
        city: this.mapCity(request.consignee.city),
        zone: request.consignee.city,
        district: '',
      },
      receiver: {
        firstName: request.consignee.name.split(' ')[0],
        lastName: request.consignee.name.split(' ').slice(1).join(' ') || '',
        phone: request.consignee.phone,
        email: request.consignee.email || '',
      },
      cod: request.shipment.cod_amount || 0,
      businessReference: request.shipment.reference || '',
      notes: request.shipment.description || '',
    }

    const result = await this.makeRequest<any>('POST', '/deliveries', bostaPayload)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      tracking_number: result.data?.trackingNumber,
      awb_number: result.data?._id,
      label_url: result.data?.pdfLabel,
      tracking_url: `https://bosta.co/track/${result.data?.trackingNumber}`,
      raw_response: result.data,
    }
  }

  async trackShipment(request: TrackShipmentRequest): Promise<TrackShipmentResponse> {
    const result = await this.makeRequest<any>('GET', `/deliveries/${request.tracking_number}`, null)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    const delivery = result.data
    const latestState = delivery?.state

    return {
      success: true,
      current_status: latestState?.value,
      status_code: latestState?.code,
      status_description: latestState?.value,
      location: delivery?.currentHub?.name,
      updated_at: latestState?.timestamp,
      events: (delivery?.history || []).map((e: any) => ({
        timestamp: e.timestamp,
        status: e.state,
        description: e.notes,
        location: e.hub?.name,
      })),
      raw_response: result.data,
    }
  }

  async cancelShipment(request: CancelShipmentRequest): Promise<CancelShipmentResponse> {
    const result = await this.makeRequest<any>('DELETE', `/deliveries/${request.tracking_number}`, null)

    return {
      success: result.success,
      message: result.success ? 'Shipment cancelled' : result.error?.message,
      error: result.error,
    }
  }

  async printLabel(request: PrintLabelRequest): Promise<PrintLabelResponse> {
    const result = await this.makeRequest<any>('GET', `/deliveries/${request.tracking_number}/awb`, null)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      label_url: result.data?.pdfLabel || result.data?.url,
      format: 'pdf',
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const result = await this.makeRequest<any>('GET', '/users/me', null)

    return {
      success: result.success,
      message: result.success 
        ? `Connected as: ${result.data?.name || result.data?.email}` 
        : (result.error?.message || 'Connection failed')
    }
  }

  mapProviderStatus(providerStatus: string): string {
    return this.statusMap[providerStatus?.toUpperCase()] || 'pending'
  }

  private mapCity(city: string): string {
    // تحويل أسماء المدن للصيغة المطلوبة من Bosta
    const cityMap: Record<string, string> = {
      'القاهرة': 'Cairo',
      'الجيزة': 'Giza',
      'الإسكندرية': 'Alexandria',
      'المنصورة': 'Mansoura',
      'طنطا': 'Tanta',
      'الزقازيق': 'Zagazig',
      'أسيوط': 'Asyut',
      'سوهاج': 'Sohag',
      'قنا': 'Qena',
      'الأقصر': 'Luxor',
      'أسوان': 'Aswan',
    }
    return cityMap[city] || city
  }
}

