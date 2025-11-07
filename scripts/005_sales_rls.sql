-- =============================================
-- RLS Policies for Estimates and Sales Orders
-- =============================================

-- Estimates
CREATE POLICY estimates_select ON estimates
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY estimates_insert ON estimates
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY estimates_update ON estimates
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY estimates_delete ON estimates
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

-- Estimate Items: join through parent estimate_id
CREATE POLICY estimate_items_select ON estimate_items
  FOR SELECT USING (
    estimate_id IN (
      SELECT id FROM estimates WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY estimate_items_insert ON estimate_items
  FOR INSERT WITH CHECK (
    estimate_id IN (
      SELECT id FROM estimates WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY estimate_items_update ON estimate_items
  FOR UPDATE USING (
    estimate_id IN (
      SELECT id FROM estimates WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  ) WITH CHECK (
    estimate_id IN (
      SELECT id FROM estimates WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY estimate_items_delete ON estimate_items
  FOR DELETE USING (
    estimate_id IN (
      SELECT id FROM estimates WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

-- Sales Orders
CREATE POLICY sales_orders_select ON sales_orders
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sales_orders_insert ON sales_orders
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sales_orders_update ON sales_orders
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  ) WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

CREATE POLICY sales_orders_delete ON sales_orders
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    )
  );

-- Sales Order Items: join through parent sales_order_id
CREATE POLICY sales_order_items_select ON sales_order_items
  FOR SELECT USING (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY sales_order_items_insert ON sales_order_items
  FOR INSERT WITH CHECK (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY sales_order_items_update ON sales_order_items
  FOR UPDATE USING (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  ) WITH CHECK (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY sales_order_items_delete ON sales_order_items
  FOR DELETE USING (
    sales_order_id IN (
      SELECT id FROM sales_orders WHERE company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
      )
    )
  );

