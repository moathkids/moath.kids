/* cost-fix.js - إصلاح حفظ سعر التكلفة */
(function() {
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (typeof window.saveProductToDb !== 'function') {
        console.warn('saveProductToDb غير جاهزة');
        return;
      }
      const originalSave = window.saveProductToDb;
      window.saveProductToDb = async function(p) {
        const productId = await originalSave(p);
        if (productId && p.cost !== undefined) {
          try {
            await sb.rpc('admin_save_product_cost', { 
              p_product_id: productId, 
              p_cost: Number(p.cost) || 0 
            });
            console.log('✅ تم حفظ سعر التكلفة:', p.cost);
          } catch (e) {
            console.warn('❌ فشل حفظ سعر التكلفة:', e);
          }
        }
        return productId;
      };
      console.log('✅ تم تفعيل إصلاح سعر التكلفة');
    }, 2000);
  });
})();