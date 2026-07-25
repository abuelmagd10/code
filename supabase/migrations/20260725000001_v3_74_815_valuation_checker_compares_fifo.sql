-- ============================================================================
-- v3.74.815 — فاحص انحراف تقييم المخزون يقارن بـ FIFO لا بحقل التكلفة
-- ============================================================================
-- المالك رصد فى لوحة التحكم «انحراف تقييم المخزون: 116.63» بينما الدفاتر
-- سليمة. السبب: الفاحص كان يقارن حساب المخزون بـ
--   SUM(الكمية × products.cost_price)
-- وهو حقل لقطة ثابت لا يمثل التقييم الفعلى — وأصناف التصنيع والخامات
-- تُنشأ بتكلفة 0 عمداً لأن **دفعات FIFO هى مصدر الحقيقة** (لا يوجد حتى
-- حقل «سعر شراء» فى فورم المادة الخام بتصميم واعٍ). فالنتيجة إنذار زائف
-- دائم يُفقد الفاحص مصداقيته.
--
-- الإصلاح: المقارنة الصحيحة الوحيدة
--   حساب 1140 (قيود مرحّلة غير مؤرشفة) ⇄ SUM(remaining_quantity × unit_cost)
-- وهو نفس ما تعرضه شاشات وتقارير المخزون.
-- + تضييق الهامش من (5 جنيه أو 1%) إلى (1 جنيه أو 0.5%) فلا يبتلع فروقاً
--   حقيقية صغيرة.
-- + رسالة إرشاد ثنائية اللغة تسمى السببين الأشهر: ازدواج ترحيل فاتورة،
--   أو قيد تكلفة بلا استهلاك دفعة (مرض 786).
--
-- بروفة على قاعدة الاختبار قبل الإنتاج: صامت على الحالة السليمة، واصطاد
-- ازدواجاً مصطنعاً قدره 25 فوراً (rollback). وعلى الإنتاج بعد التطبيق:
-- 1140 = 140.63 مقابل FIFO 140.77 (فرق تقريب 0.14 داخل الهامش) → صامت ✓
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ic_inventory_valuation_drift(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_acct_net numeric; v_fifo_value numeric; v_diff numeric; v_tol numeric;
BEGIN
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) INTO v_acct_net
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.status='posted'
                         AND COALESCE(je.is_deleted, false) = false
  JOIN chart_of_accounts coa ON coa.id=jel.account_id
  WHERE coa.company_id=p_company_id
    AND (coa.account_code='1140' OR coa.sub_type='inventory');

  SELECT COALESCE(SUM(l.remaining_quantity * l.unit_cost), 0) INTO v_fifo_value
  FROM fifo_cost_lots l
  WHERE l.company_id = p_company_id AND l.remaining_quantity > 0;

  v_diff := ROUND(v_acct_net - v_fifo_value, 2);
  v_tol := GREATEST(1, v_fifo_value * 0.005);

  IF ABS(v_diff) > v_tol THEN
    severity := CASE WHEN ABS(v_diff) > 500 THEN 'high' ELSE 'medium' END;
    detail := jsonb_build_object(
      'account_1140', v_acct_net,
      'fifo_valuation', v_fifo_value,
      'difference', v_diff,
      'hint', 'حساب المخزون فى القيود لا يطابق تقييم دفعات FIFO. راجع ازدواج ترحيل فاتورة أو قيد تكلفة بلا استهلاك دفعة. | Inventory GL does not match FIFO lot valuation - look for a double-posted bill or a COGS entry without lot consumption.');
    RETURN NEXT;
  END IF;
END $function$;
