// =============================================
// Manual Shipping Adapter
// للشحن اليدوي (مندوب داخلي / استلام من الفرع)
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

export class ManualAdapter extends BaseShippingAdapter {
  providerCode = 'manual'

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResponse> {
    // إنشاء رقم تتبع داخلي
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    const trackingNumber = `INT-${timestamp}-${random}`

    return {
      success: true,
      tracking_number: trackingNumber,
      awb_number: trackingNumber,
      raw_response: {
        type: 'manual',
        created_at: new Date().toISOString(),
        request,
      },
    }
  }

  async trackShipment(request: TrackShipmentRequest): Promise<TrackShipmentResponse> {
    // الشحن اليدوي لا يدعم التتبع الآلي
    return {
      success: true,
      current_status: 'Manual shipment - check internally',
      status_description: 'يرجى متابعة الشحنة داخلياً',
      events: [],
    }
  }

  async cancelShipment(request: CancelShipmentRequest): Promise<CancelShipmentResponse> {
    return {
      success: true,
      message: 'Manual shipment cancelled',
    }
  }

  async printLabel(request: PrintLabelRequest): Promise<PrintLabelResponse> {
    // يمكن إنشاء بوليصة داخلية بسيطة
    return {
      success: false,
      error: {
        code: 'MANUAL_SHIPPING',
        message: 'Use internal label generation for manual shipments',
      },
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: 'Manual shipping - no API connection required',
    }
  }

  mapProviderStatus(providerStatus: string): string {
    return providerStatus || 'pending'
  }
}

