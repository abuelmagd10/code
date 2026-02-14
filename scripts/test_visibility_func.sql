CREATE OR REPLACE FUNCTION test_visibility(p_asset_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_cnt INTEGER;
BEGIN
  SELECT count(*) INTO v_cnt FROM public.depreciation_schedules 
  WHERE asset_id = p_asset_id AND status = 'posted';
  RETURN v_cnt;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
