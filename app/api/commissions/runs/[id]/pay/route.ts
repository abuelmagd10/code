import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/commissions/runs/[id]/pay
 * Record commission payment
 * 
 * Security: Owner/Finance only
 */
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: employee } = await supabase
            .from('employees')
            .select('company_id')
            .eq('user_id', user.id)
            .single();

        if (!employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        // Check role - OWNER/FINANCE ONLY
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || !['owner', 'accountant'].includes(companyMember.role)) {
            return NextResponse.json(
                { error: 'ممنوع: تسجيل صرف العمولات للمالك والمحاسب فقط' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { payment_date, payment_method, payment_account_id, reference_number, notes } = body;

        if (!payment_date || !payment_method || !payment_account_id) {
            return NextResponse.json(
                { error: 'Missing required fields: payment_date, payment_method, payment_account_id' },
                { status: 400 }
            );
        }

        // Get run details
        const { data: run, error: runError } = await supabase
            .from('commission_runs')
            .select('*')
            .eq('id', id)
            .eq('company_id', employee.company_id)
            .single();

        if (runError || !run) {
            return NextResponse.json({ error: 'Commission run not found' }, { status: 404 });
        }

        // Validate state
        if (run.status !== 'posted') {
            return NextResponse.json(
                { error: `Cannot pay run in ${run.status} status. Run must be posted first.` },
                { status: 400 }
            );
        }

        // v3.74.982 — كان هنا: تُكتب «مصروفة» **ولا يُنشأ قيدٌ محاسبىٌّ**،
        // ومكتوبٌ بالحرف «لاحقاً: أنشئ قيدَ الصرف». وأثرُه أنّ المالَ يخرج من
        // البنك ويبقى التزامُ العمولات على الشركة كما هو، فتظهر الشركةُ مدينةً
        // بمالٍ دفعته. والدالّةُ التى تُنشئ القيدَ الصحيح كانت موجودةً فى
        // القاعدة **ولا ينادِيها أحد**.
        if (!run.journal_entry_id) {
            return NextResponse.json(
                { error: 'لا قيدَ ترحيلٍ لهذه الدورة، فلا يُصرف عليها' },
                { status: 409 }
            );
        }

        // حسابُ الالتزام يُقرأ من قيد الترحيل نفسِه — فهو الحسابُ الذى دُوّن
        // فيه الالتزامُ ساعةَ الترحيل، فلا يُسأل عنه المستخدمُ مرّةً ثانية.
        const { data: payableLine, error: lineError } = await supabase
            .from('journal_entry_lines')
            .select('account_id, credit_amount')
            .eq('journal_entry_id', run.journal_entry_id)
            .gt('credit_amount', 0)
            .order('credit_amount', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lineError || !payableLine || !payableLine.account_id) {
            return NextResponse.json(
                { error: 'لم أجد حسابَ التزام العمولات فى قيد الترحيل' },
                { status: 409 }
            );
        }

        const { data: payResult, error: payError } = await supabase.rpc('pay_commission_run_atomic', {
            p_commission_run_id: id,
            p_payable_account_id: payableLine.account_id,
            p_bank_account_id: payment_account_id,
            p_user_id: user.id,
            p_payment_date: payment_date,
        });

        if (payError) {
            console.error('Error paying run:', payError);
            return NextResponse.json(
                { error: payError.message || 'تعذّر تسجيلُ صرف العمولات' },
                { status: 500 }
            );
        }

        // ولا يُطلب من المستخدم ما لا يُستعمل: طريقةُ الصرف ومرجعُه كانا
        // يُطلبان ثمّ يُهملان، فصارا يُحفظان مع الدورة.
        const noteParts = [
            notes || run.notes,
            payment_method ? ('طريقة الصرف: ' + String(payment_method)) : null,
            reference_number ? ('المرجع: ' + String(reference_number)) : null,
        ].filter(Boolean);
        if (noteParts.length > 0) {
            // v3.74.982 — قاعدةُ العميل لا ترمى خطأً بل تُرجعه فى الردّ،
            // فكتابةٌ لا يُفحص ردُّها تسقط بصمتٍ ويمضى الكودُ كأنّها نجحت.
            // والقيدُ أُنشئ والصرفُ تمّ، فلا يُلغيهما فشلُ حفظِ ملاحظة —
            // لكنّه لا يُبتلع صامتاً.
            const { error: notesError } = await supabase
                .from('commission_runs')
                .update({ notes: noteParts.join(' · ') })
                .eq('id', id);
            if (notesError) {
                console.error('Error saving commission payment notes:', notesError);
            }
        }

        return NextResponse.json({ success: true, result: payResult });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

