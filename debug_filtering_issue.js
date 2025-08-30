const customers = [
  { name: 'BELTRAN BARRIGA, MARIA DEL CARMEN', city: 'Huelva', province: 'Huelva' },
  { name: 'Test Customer', city: 'Alcalá del Valle', province: 'Cádiz' }
];

const selectedProvince = 'Huelva';
const selectedCity = 'Alcalá del Valle';

const toCanonicalProvince = (v) => {
  const s = String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s === 'huelva') return 'Huelva';
  if (s === 'cadiz') return 'Cádiz';
  if (s === 'ceuta') return 'Ceuta';
  return '';
};

const displayProvince = (customer) => {
  if (customer.province) return toCanonicalProvince(customer.province);
  if (customer.city === 'Cádiz' || customer.city === 'Huelva' || customer.city === 'Ceuta') {
    return toCanonicalProvince(customer.city);
  }
  return '';
};

const displayCity = (customer) => {
  if (customer.city && customer.city !== 'Cádiz' && customer.city !== 'Huelva' && customer.city !== 'Ceuta') {
    return customer.city;
  }
  if (customer.city === customer.province) return customer.city;
  return '';
};

console.log('=== FILTERING DEBUG ===');
customers.forEach(customer => {
  const customerProvince = displayProvince(customer);
  const customerCity = displayCity(customer);
  const customerCityRaw = String(customer.city || '').trim();
  
  const matchesProvince = !selectedProvince || toCanonicalProvince(customerProvince) === toCanonicalProvince(selectedProvince);
  const matchesCity = !selectedCity || 
                     customerCity === selectedCity || 
                     customerProvince === selectedCity ||
                     customerCityRaw === selectedCity;
  
  console.log(`Customer: ${customer.name}`);
  console.log(`  Raw city: '${customer.city}', province: '${customer.province}'`);
  console.log(`  Display province: '${customerProvince}', display city: '${customerCity}'`);
  console.log(`  Matches province (${selectedProvince}): ${matchesProvince}`);
  console.log(`  Matches city (${selectedCity}): ${matchesCity}`);
  console.log(`  Overall match: ${matchesProvince && matchesCity}`);
  console.log('');
});

console.log('=== PROBLEM ANALYSIS ===');
console.log('Issue: Selecting Huelva province + Alcalá del Valle city should show no results');
console.log('because Alcalá del Valle belongs to Cádiz province, not Huelva.');
console.log('This is actually CORRECT behavior - the filter is working as intended.');
