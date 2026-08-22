-- v3.75.85 — **وتكلفةُ الصنفِ تُقاسُ بعملةِ الدفترِ لا بعملةِ البائع.**
-- ---------------------------------------------------------------------------
-- ═══ لماذا هذه قبلَ شاشةِ الفاتورة ═══
--
-- قِيسَ فى v3.75.84 أنَّ أمرَ الشراءِ يقبلُ عملةً أجنبيّةً فعلاً، وأنَّ فاتورةَ
-- الشراءِ التى تليه **لا تعرفُ العملةَ إطلاقاً**. ومُنعَ يومَها أن يُسجَّلَ مالٌ
-- بعملةٍ لم تُترجَم، فصارَ الخطأُ الصامتُ فى **رأسِ** الفاتورةِ مستحيلاً.
--
-- **لكنَّ عمقَ الطريقِ ظلَّ أعمى**: بيتُ التكلفةِ المُنزَلة
-- (`fn_bill_item_landed_unit_cost`) يقرأُ قيمةَ الفاتورةِ والشحنَ كما هما **بلا
-- ضربٍ فى سعرِ صرف**، ومنه تُبنى:
--
--   • تكلفةُ وحدةِ الوارد-أوّلاً (`create_fifo_lot_on_purchase`)، ومنها تكلفةُ
--     المبيعاتِ ثمّ الربح.
--   • وتكلفةُ حركةِ المخزون (`fn_set_purchase_movement_landed_cost`) — وهى تنادى
--     **نفسَ البيتِ حرفيّاً ولا صيغةَ ثانيةَ لها**.
--
-- فلو فُتحت شاشةُ الفاتورةِ للعملاتِ **قبلَ** هذا، لدخلَ الرقمُ الدولارىُّ إلى
-- المخزونِ كأنّه محلّىٌّ ولم يصرخْ أحد — **ورأسُ الفاتورةِ صادقٌ وعمقُها كاذب**.
-- **فالترتيبُ نفسُه ضابطٌ لا تفصيل**: يُصحَّحُ العمقُ أوّلاً، ثمّ تُفتَحُ الشاشة.
--
-- ═══ وقِيسَ أنَّها لا تُغيّرُ حرفاً اليوم ═══
--
-- شُغِّلَ الحسابانِ — القائمُ والمقترَحُ — على **كلِّ سطرِ فاتورةٍ على الإنتاج**
-- قبلَ كتابةِ حرفٍ من العلاج: **١٤ زوجاً، صفرٌ منها يتغيّر**، ولا قيمةَ فارغة،
-- وأصغرُ سعرِ صرفٍ وأكبرُه **١٫٠٠٠٠٠٠٠٠** بالضبط. فالضربُ فى الواحدِ لا يُحرِّكُ
-- رقماً، **والدفترُ والمخزونُ لا يمكنُ أن يتحرّكا**.
--
-- ═══ وسعرٌ غيرُ موجبٍ لا يمحو تكلفةً ═══
--
-- لو كانَ سعرُ الصرفِ صفراً أو فارغاً أو سالباً لصارت التكلفةُ صفراً —
-- **وهو بعينُه عطبُ التكلفةِ الصفريّةِ المُصلَحُ فى v3.74.702**. فيُقرَأُ السعرُ
-- **موجباً أو لا يُقرَأُ**: ما لم يكنْ أكبرَ من صفرٍ عُومِلَ كواحد. ولا يُداهنُ
-- ذلك عملةً أجنبيّةً بلا سعر، فتلك يرفضُها قانونُ v3.75.84 عندَ ميلادِ الصفِّ
-- أصلاً — **فلا يجتمعُ على المشروعِ صمتانِ فى موضعٍ واحد**.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_bill_item_landed_unit_cost(p_bill_id uuid, p_product_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
-- v3.74.704 — LANDED COST: what a unit actually cost us, not its list price.
-- Allocates the bill's own authoritative (subtotal + shipping) across the lines
-- in proportion to their net value, so the lot costs sum to the inventory debit
-- exactly, whatever pricing rules the application applies.
--
-- v3.74.715 — the weights must be NET OF TAX.
-- bills.subtotal is always stored excluding tax. The weights were taken straight
-- from unit_price, which on a TAX-INCLUSIVE bill still contains the tax. With one
-- tax rate that cancels out — every weight is inflated by the same factor — but
-- with DIFFERENT rates on different lines it silently skews the split: a line at
-- 14% is weighted 1.14x against a line at 0%, so it absorbs cost belonging to the
-- other product. Verified: two lines whose true cost is 100 each came out 106.54
-- and 93.46. The bill total stayed right, which is exactly why nothing caught it —
-- only the per-product cost, and therefore per-product profit, was wrong.
--
-- v3.75.85 — AND THE COST IS MEASURED IN THE LEDGER'S CURRENCY, NOT THE SELLER'S.
-- The allocatable amount is translated by the bill's exchange rate before it is
-- spread, and the fallback list price with it. The WEIGHTS need no rate: they are
-- a ratio, and the rate cancels out of both sides of it.
-- A rate that is not greater than zero is read as one, because a zero rate would
-- wipe the cost to nothing - the zero-cost lot bug of v3.74.702. A foreign bill
-- with no usable rate cannot exist at all: erp_foreign_money_is_translated refuses
-- it when the row is born.
DECLARE
  v_qty         numeric;
  v_unit_price  numeric;
  v_disc_pct    numeric;
  v_tax_rate    numeric;
  v_line_net    numeric;
  v_base        numeric;
  v_allocatable numeric;
  v_tax_incl    boolean;
  v_rate        numeric;
BEGIN
  SELECT COALESCE(b.tax_inclusive, false),
         CASE WHEN COALESCE(b.exchange_rate, 1) > 0 THEN COALESCE(b.exchange_rate, 1) ELSE 1 END
    INTO v_tax_incl, v_rate
  FROM bills b WHERE b.id = p_bill_id;

  SELECT (COALESCE(b.subtotal, 0) + COALESCE(b.shipping, 0)) * v_rate
    INTO v_allocatable
  FROM bills b WHERE b.id = p_bill_id;

  SELECT bi.quantity, bi.unit_price, COALESCE(bi.discount_percent, 0), COALESCE(bi.tax_rate, 0)
    INTO v_qty, v_unit_price, v_disc_pct, v_tax_rate
  FROM bill_items bi
  WHERE bi.bill_id = p_bill_id AND bi.product_id = p_product_id
  LIMIT 1;

  IF v_qty IS NULL OR v_qty <= 0 THEN RETURN NULL; END IF;

  v_line_net := v_qty * COALESCE(v_unit_price, 0) * (1 - v_disc_pct / 100.0);
  IF v_tax_incl THEN
    v_line_net := v_line_net / (1 + v_tax_rate / 100.0);
  END IF;

  SELECT COALESCE(SUM(
           (bi.quantity * COALESCE(bi.unit_price,0) * (1 - COALESCE(bi.discount_percent,0) / 100.0))
           / CASE WHEN v_tax_incl THEN (1 + COALESCE(bi.tax_rate,0) / 100.0) ELSE 1 END
         ), 0)
    INTO v_base
  FROM bill_items bi
  WHERE bi.bill_id = p_bill_id;

  -- No usable basis to allocate against: fall back to the list price rather than
  -- risk a zero-cost lot — that failure mode is exactly what produced the
  -- zero-cost COGS bug fixed in v3.74.702. And the fallback is translated too,
  -- because a list price in dollars is not a cost in the ledger's currency.
  IF v_base IS NULL OR v_base <= 0 OR v_allocatable IS NULL OR v_allocatable <= 0 THEN
    RETURN COALESCE(v_unit_price, 0) * COALESCE(v_rate, 1);
  END IF;

  RETURN ROUND((v_allocatable * (v_line_net / v_base)) / v_qty, 6);
END;
$function$;
