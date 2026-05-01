import { NextRequest, NextResponse } from 'next/server';

const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY!;
const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY!;
const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID!;

// 500 EGP per additional user
const PRICE_PER_USER_CENTS = 50000; // in piasters (cents)
const CURRENCY = 'EGP';

// Paymob NextGen: Create a Payment Intention
export async function POST(req: NextRequest) {
  try {
    const { additionalUsers, companyId, userId, userEmail, userName } = await req.json();

    if (!additionalUsers || additionalUsers < 1) {
      return NextResponse.json({ error: 'عدد المستخدمين غير صحيح' }, { status: 400 });
    }

    // 500 EGP per additional user (in piasters × 100)
    const amountCents = additionalUsers * PRICE_PER_USER_CENTS;

    // Step 1: Create Intention with Paymob NextGen API
    const intentionRes = await fetch('https://accept.paymob.com/v1/intention/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${PAYMOB_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: amountCents,
        currency: CURRENCY,
        payment_methods: [parseInt(PAYMOB_INTEGRATION_ID)],
        items: [
          {
            name: `مستخدمين إضافيين - ${additionalUsers} مستخدم`,
            amount: amountCents,
            description: `اشتراك شهري - ${additionalUsers} مستخدم إضافي بـ 500 جنيه لكل مستخدم`,
            quantity: 1,
          },
        ],
        billing_data: {
          email: userEmail || 'customer@example.com',
          first_name: userName?.split(' ')[0] || 'Customer',
          last_name: userName?.split(' ')[1] || 'User',
          phone_number: 'N/A',
          street: 'N/A',
          city: 'N/A',
          country: 'EG',
        },
        extras: {
          company_id: companyId,
          user_id: userId,
          additional_users: additionalUsers,
        },
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/webhooks/paymob`,
        redirection_url: `${process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/payment/result`,
      }),
    });

    if (!intentionRes.ok) {
      const errData = await intentionRes.json();
      console.error('Paymob intention error:', errData);
      return NextResponse.json({ error: 'فشل في إنشاء طلب الدفع', details: errData }, { status: 500 });
    }

    const intentionData = await intentionRes.json();

    return NextResponse.json({
      client_secret: intentionData.client_secret,
      public_key: PAYMOB_PUBLIC_KEY,
      amount: amountCents,
      currency: 'USD',
    });
  } catch (error: any) {
    console.error('Checkout API error:', error);
    return NextResponse.json({ error: 'حدث خطأ غير متوقع', details: error.message }, { status: 500 });
  }
}
