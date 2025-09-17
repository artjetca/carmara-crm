import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = 'https://qvgmpcrqctevgkuagiqz.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugCustomerCoords() {
  try {
    // 查询MONTIANOS AGUILAR, ROSA ANA的具体数据
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .ilike('name', '%MONTIANOS AGUILAR%');
    
    if (error) {
      console.error('Error fetching customer:', error);
      return;
    }
    
    if (customers && customers.length > 0) {
      console.log('Found customers matching MONTIANOS AGUILAR:');
      customers.forEach((customer, index) => {
        console.log(`\n=== Customer ${index + 1} ===`);
        console.log('ID:', customer.id);
        console.log('Name:', customer.name);
        console.log('Address:', customer.address);
        console.log('City:', customer.city);
        console.log('Province:', customer.province);
        console.log('Postal Code:', customer.cp || customer.postal_code);
        console.log('Notes:', customer.notes);
        console.log('Latitude:', customer.latitude);
        console.log('Longitude:', customer.longitude);
        
        // 构建完整地址
        const parts = [];
        if (customer.address) parts.push(customer.address);
        const cp = customer.cp || customer.postal_code;
        if (cp) parts.push(String(cp));
        if (customer.city) parts.push(customer.city);
        if (customer.province) parts.push(customer.province);
        parts.push('España');
        const fullAddress = parts.join(', ');
        console.log('Full Address for Geocoding:', fullAddress);
      });
    } else {
      console.log('No customers found matching MONTIANOS AGUILAR');
    }
    
    // 也查询所有Cádiz的客户
    console.log('\n=== All Cádiz customers ===');
    const { data: cadizCustomers, error: cadizError } = await supabase
      .from('customers')
      .select('id, name, address, city, province, cp, postal_code, latitude, longitude, notes')
      .or('city.ilike.%cádiz%,province.ilike.%cádiz%');
    
    if (cadizError) {
      console.error('Error fetching Cádiz customers:', cadizError);
      return;
    }
    
    if (cadizCustomers && cadizCustomers.length > 0) {
      cadizCustomers.forEach((customer, index) => {
        console.log(`\nCádiz Customer ${index + 1}:`);
        console.log('Name:', customer.name);
        console.log('Address:', customer.address);
        console.log('City:', customer.city);
        console.log('Province:', customer.province);
        console.log('Coords:', customer.latitude, customer.longitude);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugCustomerCoords();
