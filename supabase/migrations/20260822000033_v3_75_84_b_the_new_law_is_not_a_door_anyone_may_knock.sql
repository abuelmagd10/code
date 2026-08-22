-- v3.75.84 — **ولا يُفتَحُ بابٌ لم يُطلَبْ فتحُه.**
--
-- الدالّةُ الجديدةُ وُلدت بمنحةِ التنفيذِ الافتراضيّةِ للجميع (PUBLIC و
-- authenticated)، وهى **دالّةُ مُشغِّلٍ بصلاحيّاتٍ كاملة** لا يُنادِيها بشرٌ أصلاً.
-- وأختُها `erp_currency_is_asked_at_birth` مقصورةٌ على postgres و service_role،
-- **فيُسوّى الجديدُ بها بالضبط** — لا أوسعَ منها ولا أضيق.
REVOKE ALL ON FUNCTION public.erp_foreign_money_is_translated() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_foreign_money_is_translated() FROM anon;
REVOKE ALL ON FUNCTION public.erp_foreign_money_is_translated() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erp_foreign_money_is_translated() TO service_role;
