const customers = [
  { name: 'Test1', city: 'Huelva', province: 'Huelva' },
  { name: 'Test2', city: 'Algeciras', province: 'Cádiz' },
  { name: 'Test3', city: 'Ceuta', province: 'Ceuta' }
];

const displayCity = (customer) => {
  if (!customer) return '';
  const city = String(customer.city || '').trim();
  if (city) {
    const isProvinceName = ['Cádiz', 'Huelva', 'Ceuta'].includes(city);
    if (isProvinceName) {
      const province = customer.province || '';
      if (province === city) {
        return city;
      }
      return '';
    }
    return city;
  }
  return '';
};

const selectedCity = 'Huelva';
customers.forEach(customer => {
  const customerCity = displayCity(customer);
  const customerProvince = customer.province;
  const customerCityRaw = String(customer.city || '').trim();
  
  const matchesCity = !selectedCity || 
                     customerCity === selectedCity || 
                     customerProvince === selectedCity ||
                     customerCityRaw === selectedCity;
  
  console.log('Customer: ' + customer.name);
  console.log('  City: ' + customerCity);
  console.log('  Province: ' + customerProvince);
  console.log('  CityRaw: ' + customerCityRaw);
  console.log('  Matches: ' + matchesCity);
  console.log('---');
});
