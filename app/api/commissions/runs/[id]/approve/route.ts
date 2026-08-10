import { isSeniorRole } from "@/lib/roles"
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/commissions/runs/[id]/approve
 * Approve a commission run (transition: draft/reviewed → approved)
 * 
 * Security: Admin/Finance only
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

        // Check role
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        // v3.74.982 — قرارُ المالك: المحاسبُ قد يكون هو من أنشأ الدورة، فلا
        // يعتمد عملَ نفسه. الاعتمادُ للمالك أو المدير العام وحدَهما، والإنشاءُ
        // والترحيلُ والصرفُ تبقى للمحاسب.
        if (!companyMember || !isSeniorRole(companyMember.role)) {
            return NextResponse.json(
                { error: 'ممنوع: اعتماد دورة العمولات للمالك أو المدير العام فقط' },
                { status: 403 }
            );
        }

        // v3.74.982 — كان الاعتمادُ يكتب «معتمدة» **بلا أن يسأل عن الحالة
        // الحاليّة إطلاقاً**، فدورةٌ مرحَّلةٌ للحسابات أو مصروفةٌ فعلاً تُرجَع
        // إلى «معتمدة» بضغطة، فيُرحَّل نفسُ المبلغ مرّةً ثانية.
        // والمنعُ الجذرىُّ فى قاعدة البيانات (قيدٌ على الجدول يرفض الرجوعَ من
        // أىِّ باب)، وهذا هنا ليقرأ المستخدمُ سبباً مفهوماً لا خطأً تقنيّاً.
        const { data: current, error: readError } = await supabase
            .from('commission_runs')
            .select('status')
            .eq('id', id)
            .eq('company_id', employee.company_id)
            .single();

        if (readError || !current) {
            return NextResponse.json({ error: 'دورةُ العمولات غير موجودة' }, { status: 404 });
        }

        if (!['draft', 'reviewed'].includes(String(current.status || ''))) {
            return NextResponse.json(
                { error: 'لا يمكن اعتمادُ دورةٍ حالتها «' + String(current.status) + '» — الاعتمادُ للمسودّة أو المراجَعة فقط' },
                { status: 409 }
            );
        }

        // Update run status
        const { data: run, error } = await supabase
            .from('commission_runs')
            .update({
                status: 'approved',
                approved_by: user.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('company_id', employee.company_id)
            .select()
            .single();

        if (error) {
            console.error('Error approving run:', error);
            return NextResponse.json({ error: 'Failed to approve run' }, { status: 500 });
        }

        return NextResponse.json({ run });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
