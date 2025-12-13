// =============================================
// Aramex Shipping Adapter
// أرامكس
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

export class AramexAdapter extends BaseShippingAdapter {
  providerCode = 'aramex'

  // خريطة حالات Aramex للحالات الداخلية
  private statusMap: Record<string, string> = {
    'INFO_RECEIVED': 'created',
    'PICKED_UP': 'picked_up',
    'IN_TRANSIT': 'in_transit',
    'OUT_FOR_DELIVERY': 'out_for_delivery',
    'DELIVERED': 'delivered',
    'RETURNED': 'returned',
    'CANCELLED': 'cancelled',
    'EXCEPTION': 'failed',
  }

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    // تحويل البيانات لصيغة Aramex
    const aramexPayload = {
      Shipments: [{
        Shipper: {
          Contact: {
            PersonName: request.shipper.name,
            CompanyName: request.shipper.company || request.shipper.name,
            PhoneNumber1: request.shipper.phone,
            EmailAddress: request.shipper.email || '',
          },
          Address: {
            Line1: request.shipper.address,
            City: request.shipper.city,
            CountryCode: this.getCountryCode(request.shipper.country),
            PostCode: request.shipper.postal_code || '',
          }
        },
        Consignee: {
          Contact: {
            PersonName: request.consignee.name,
            CompanyName: request.consignee.company || '',
            PhoneNumber1: request.consignee.phone,
            EmailAddress: request.consignee.email || '',
          },
          Address: {
            Line1: request.consignee.address,
            City: request.consignee.city,
            CountryCode: this.getCountryCode(request.consignee.country),
            PostCode: request.consignee.postal_code || '',
          }
        },
        Details: {
          ActualWeight: { Value: request.shipment.weight, Unit: 'KG' },
          NumberOfPieces: request.shipment.pieces || 1,
          ProductType: this.config.default_service || 'DOM',
          DescriptionOfGoods: request.shipment.description || 'Goods',
          CashOnDeliveryAmount: request.shipment.cod_amount ? {
            Value: request.shipment.cod_amount,
            CurrencyCode: request.shipment.currency || 'EGP'
          } : null,
        },
        Reference1: request.shipment.reference || '',
      }],
      ClientInfo: {
        AccountNumber: this.config.account_number,
        AccountPin: this.config.api_secret,
        AccountEntity: this.config.extra_config?.entity || 'CAI',
        AccountCountryCode: this.config.extra_config?.country_code || 'EG',
        UserName: this.config.api_key,
        Password: this.config.api_secret,
      }
    }

    const result = await this.makeRequest<any>('POST', '/shipments/create', aramexPayload)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    const shipment = result.data?.Shipments?.[0]
    return {
      success: true,
      tracking_number: shipment?.ID,
      awb_number: shipment?.ID,
      label_url: shipment?.LabelURL,
      tracking_url: `https://www.aramex.com/track/results?q=${shipment?.ID}`,
      raw_response: result.data,
    }
  }

  async trackShipment(request: TrackShipmentRequest): Promise<TrackShipmentResponse> {
    const result = await this.makeRequest<any>('POST', '/track/shipments', {
      Shipments: [request.tracking_number],
      ClientInfo: {
        AccountNumber: this.config.account_number,
        UserName: this.config.api_key,
        Password: this.config.api_secret,
      }
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    const tracking = result.data?.TrackingResults?.[0]
    const latestEvent = tracking?.Value?.[0]

    return {
      success: true,
      current_status: latestEvent?.UpdateDescription,
      status_code: latestEvent?.UpdateCode,
      location: latestEvent?.UpdateLocation,
      updated_at: latestEvent?.UpdateDateTime,
      events: (tracking?.Value || []).map((e: any) => ({
        timestamp: e.UpdateDateTime,
        status: e.UpdateDescription,
        status_code: e.UpdateCode,
        location: e.UpdateLocation,
      })),
      raw_response: result.data,
    }
  }

  async cancelShipment(request: CancelShipmentRequest): Promise<CancelShipmentResponse> {
    // Aramex لا يدعم الإلغاء المباشر عبر API في معظم الحالات
    return {
      success: false,
      error: { code: 'NOT_SUPPORTED', message: 'Aramex cancellation requires manual process' }
    }
  }

  async printLabel(request: PrintLabelRequest): Promise<PrintLabelResponse> {
    const result = await this.makeRequest<any>('POST', '/shipments/print-label', {
      ShipmentNumber: request.tracking_number,
      Format: request.format?.toUpperCase() || 'PDF',
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    return {
      success: true,
      label_url: result.data?.LabelURL,
      label_data: result.data?.LabelData,
      format: request.format || 'pdf',
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    const result = await this.makeRequest<any>('POST', '/account/validate', {
      ClientInfo: {
        AccountNumber: this.config.account_number,
        UserName: this.config.api_key,
        Password: this.config.api_secret,
      }
    })

    return {
      success: result.success,
      message: result.success ? 'Connection successful' : (result.error?.message || 'Connection failed')
    }
  }

  mapProviderStatus(providerStatus: string): string {
    return this.statusMap[providerStatus?.toUpperCase()] || 'pending'
  }

  private getCountryCode(country: string): string {
    const codes: Record<string, string> = {
      'egypt': 'EG', 'مصر': 'EG',
      'saudi arabia': 'SA', 'السعودية': 'SA',
      'uae': 'AE', 'الإمارات': 'AE',
      'kuwait': 'KW', 'الكويت': 'KW',
    }
    return codes[country.toLowerCase()] || country.substring(0, 2).toUpperCase()
  }
}

