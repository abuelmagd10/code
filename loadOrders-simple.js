  // تحميل الأوامر - إصدار مبسط جداً
  const loadOrders = async () => {
    try {
      setLoading(true);
      const activeCompanyId = await getActiveCompanyId(supabase);
      if (!activeCompanyId) {
        setLoading(false);
        return;
      }

      // 🚨 إصلاح طارئ: جلب جميع أوامر البيع بدون أي فلاتر حوكمة
      console.log('🔍 Loading sales orders for company:', activeCompanyId);
      
      const { data: so, error: ordersError } = await supabase
        .from("sales_orders")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });

      if (ordersError) {
        console.error('❌ Error loading orders:', ordersError);
        toast({
          title: 'خطأ في التحميل',
          description: 'فشل تحميل أوامر البيع: ' + ordersError.message,
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      console.log('✅ Loaded orders:', so?.length || 0);
      setOrders(so || []);

      // جلب العملاء
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", activeCompanyId)
        .order("name");
      
      setCustomers(customers || []);

      // جلب المنتجات
      const { data: products } = await supabase
        .from("products")
        .select("id, name, unit_price, item_type")
        .eq("company_id", activeCompanyId)
        .order("name");
      
      setProducts(products || []);

      setLoading(false);
    } catch (error) {
      console.error('❌ Unexpected error:', error);
      toast({
        title: 'خطأ غير متوقع',
        description: 'حدث خطأ أثناء تحميل البيانات',
        variant: 'destructive'
      });
      setLoading(false);
    }
  };