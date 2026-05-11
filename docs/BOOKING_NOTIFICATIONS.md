# Booking Notifications — Technical Reference

## Overview

The booking notification system delivers **in-app** notifications to relevant staff members when key booking lifecycle events occur. All notifications are sent asynchronously and non-blocking — a notification failure never causes an API error.

The implementation follows the same pattern as `PurchaseOrderNotificationService`.

---

## Architecture

```
Booking API Route
      │
      ▼ (after RPC success + asyncAuditLog)
try {
  new BookingNotificationService(supabase).notifyXxx(...)
} catch (err) {
  console.error(...)   // silent — never propagates
}
      │
      ▼
BookingNotificationService
  ├── loadContext(bookingId)       → v_bookings_full
  ├── NotificationRecipientResolverService
  │     ├── resolveLeadershipRecipients()
  │     ├── resolveRoleRecipients('manager' | 'accountant')
  │     └── resolveUserRecipient(staffUserId)
  └── supabase.rpc('create_notification', { ... })
        category: 'sales'
        reference_type: 'booking'
        reference_id: bookingId
        event_key: buildNotificationEventKey(...)
```

---

## Event Reference

| Event | Method | Recipients | Priority | Severity |
|-------|--------|-----------|----------|----------|
| Booking created | `notifyBookingCreated` | Branch manager | normal | info |
| Booking confirmed | `notifyBookingConfirmed` | Assigned staff (personal) | normal | info |
| Service started | `notifyBookingStarted` | Branch manager | low | info |
| Service completed | `notifyBookingCompleted` | Branch accountant (high) + Assigned staff (normal) | high / normal | info |
| Booking cancelled | `notifyBookingCancelled` | Branch manager + Assigned staff | high | warning |
| Customer no-show | `notifyBookingNoShow` | Branch manager | high | warning |
| Payment added | `notifyBookingPaymentAdded` | Branch accountant | normal | info |
| Low rating (< 3★) | `notifyLowRating` | Leadership + Branch manager | urgent | warning |
| Service reminder | `notifyBookingReminder` | Assigned staff (or manager fallback) | high | info |

---

## Notification Content

All notifications include a human-readable booking label:

```
رقم BK-0042 | العميل: Ahmed Ali | الخدمة: Deep Tissue Massage | التاريخ: 2026-06-01 | الوقت: 10:00
```

### Key Event Messages

**Created** — `"حجز جديد بانتظار التأكيد"`  
**Confirmed** — `"تم تأكيد الحجز — جاهز للخدمة"`  
**Started** — `"بدأت الخدمة"`  
**Completed** — `"اكتملت الخدمة — يرجى مراجعة الفاتورة"` (includes invoice number if available)  
**Cancelled** — `"تم إلغاء الحجز"` (includes deposit warning if `paid_amount > 0`)  
**No-show** — `"العميل لم يحضر — تحقق من الحجوزات"`  
**Payment** — `"تم تسجيل دفعة جديدة"` (includes amount and method)  
**Low rating** — `"تقييم منخفض ⚠️"` (only fires when rating < 3 stars)  
**Reminder** — `"تذكير بالخدمة القادمة"` (includes hours until service)

---

## Deep-Link Routing

Clicking a booking notification navigates to `/bookings/<bookingId>`.

Registered in `lib/notification-routing.ts`:

```typescript
'booking': (id) => `/bookings/${id}`
```

---

## Cron Reminder Job

### Schedule
Every 15 minutes via Vercel Cron (configured in `vercel.json`).

### Endpoint
```
GET /api/cron/booking-reminders
Authorization: Bearer <CRON_SECRET>
```

### Logic
1. Query all `bookings` where `status = 'confirmed'` AND `reminder_sent = false` AND `booking_date` is today or tomorrow.
2. Filter in-process to bookings whose `booking_date + start_time` falls within `[now, now + 24h]`.
3. Call `notifyBookingReminder()` for each candidate.
4. Update `reminder_sent = true` on success.
5. Return `{ processed, sent, failed }`.

### Response Example
```json
{ "processed": 3, "sent": 3, "failed": 0 }
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Shared secret for cron auth — set in Vercel project settings |

---

## Service Client

The cron endpoint uses `createServiceClient()` (Supabase service-role key) to bypass RLS, since the cron runs in a system context with no authenticated user session.

All booking API routes use the standard `createClient()` (user session), so recipient resolution is scoped to the company via RLS.

---

## Files

| Path | Description |
|------|-------------|
| `lib/services/booking-notification.service.ts` | Core notification service — 9 event methods |
| `lib/notification-routing.ts` | Added `'booking'` reference type → `/bookings/:id` |
| `app/api/cron/booking-reminders/route.ts` | Cron job — sends upcoming service reminders |
| `vercel.json` | Cron schedule (`*/15 * * * *`) |
| `app/api/bookings/route.ts` | POST wired → `notifyBookingCreated` |
| `app/api/bookings/[id]/confirm/route.ts` | POST wired → `notifyBookingConfirmed` |
| `app/api/bookings/[id]/start/route.ts` | POST wired → `notifyBookingStarted` |
| `app/api/bookings/[id]/complete/route.ts` | POST wired → `notifyBookingCompleted` |
| `app/api/bookings/[id]/cancel/route.ts` | POST wired → `notifyBookingCancelled` |
| `app/api/bookings/[id]/no-show/route.ts` | POST wired → `notifyBookingNoShow` |
| `app/api/bookings/[id]/payment/route.ts` | POST wired → `notifyBookingPaymentAdded` |
| `app/api/bookings/[id]/rate/route.ts` | POST wired → `notifyLowRating` (if rating < 3) |

---

## Design Decisions

1. **No new notification category** — uses existing `'sales'` category. Adding a `'bookings'` category would require a DB constraint migration.

2. **Context loaded inside service** — `BookingNotificationService.loadContext()` fetches from `v_bookings_full`, keeping all 8 API routes clean (one-liner call, no extra DB round-trips in the route handler).

3. **Silent failure** — Every API route wraps the notification call in `try/catch`. Notification failures are logged to console but never propagate to the HTTP response.

4. **Idempotent notifications** — `create_notification` RPC uses a unique `event_key`, so duplicate cron invocations or retries won't create duplicate notifications.

5. **Recipient resolver** — Uses the same `NotificationRecipientResolverService` as all other ERP modules (PO, Sales, etc.). No custom recipient logic.
