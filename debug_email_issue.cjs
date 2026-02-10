require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function debugEmailIssue() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== 調試排程郵件問題 ===\n');

  // 1. Check customers with emails
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('id, name, email, company')
    .not('email', 'is', null)
    .limit(5);
    
  if (custError) {
    console.log('❌ 客戶查詢錯誤:', custError);
    return;
  }
  
  console.log(`1. 有電子郵件的客戶 (${customers.length} 個):`);
  customers.forEach(c => {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email);
    console.log(`   ${c.name}: ${c.email} ${isValid ? '✅' : '❌'}`);
  });

  // 2. Create a test message
  const customer = customers[0];
  if (!customer) {
    console.log('❌ 沒有客戶可用於測試');
    return;
  }

  console.log(`\n2. 創建測試郵件給: ${customer.name}`);
  
  const messageData = {
    customer_ids: [customer.id],
    message: `EMAIL: 這是一個測試郵件，確認排程功能正常運作 (測試主題 - ${new Date().toLocaleTimeString()}) | Cliente: ${customer.name} (${customer.company || 'Sin empresa'})`,
    scheduled_for: new Date().toISOString(), // 立即排程
    status: 'pending',
    created_by: '9a90b412-df5c-4b30-af95-e875a402e1ca'
  };
  
  const { data: insertData, error: insertError } = await supabase
    .from('scheduled_messages')
    .insert(messageData)
    .select('*');
    
  if (insertError) {
    console.log('❌ 郵件創建失敗:', insertError);
  } else {
    console.log('✅ 測試郵件創建成功');
    console.log(`   ID: ${insertData[0].id}`);
    console.log(`   排程時間: ${insertData[0].scheduled_for}`);
    console.log(`   客戶: ${JSON.stringify(insertData[0].customer_ids)}`);
    
    // 3. Trigger the scheduler
    console.log('\n3. 觸發排程器...');
    try {
      const response = await fetch('http://localhost:8888/.netlify/functions/trigger-scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (response.ok) {
        console.log('✅ 排程器執行成功');
        console.log(`   處理: ${result.result?.processed || 0} 個`);
        console.log(`   失敗: ${result.result?.failed || 0} 個`);
      } else {
        console.log('❌ 排程器執行失敗:', result);
      }
    } catch (fetchError) {
      console.log('❌ 無法連接排程器 (可能需要啟動本地伺服器):', fetchError.message);
    }
    
    // 4. Check final status
    console.log('\n4. 檢查最終狀態...');
    const { data: finalData, error: finalError } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('id', insertData[0].id);
      
    if (finalError) {
      console.log('❌ 狀態查詢失敗:', finalError);
    } else {
      const msg = finalData[0];
      console.log(`   狀態: ${msg.status}`);
      if (msg.error_message) {
        console.log(`   錯誤: ${msg.error_message}`);
      }
    }
  }
}

debugEmailIssue().catch(console.error);
