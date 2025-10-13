import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Plus, Search, Users, Trash2 } from 'lucide-react';
import { translations } from '../lib/translations';

interface Customer {
  id: string;
  name: string;
  company?: string;
  created_by: string;
}

interface CustomerToVerify {
  name: string;
  exists: boolean;
  id?: string;
}

const CUSTOMERS_TO_VERIFY = [
  'ABACERÍA HERMANOS CARO',
  'ABACERÍA MARISOL',
  'ACEITES BORGES PONT, S.A.U.',
  'ACEITES Y VINAGRES DEL SUR',
  'ACEITUNERA DEL SUR',
  'AGRO SEVILLA ACEITUNAS',
  'ALIMENTACIÓN GARCÍA',
  'ALIMENTACIÓN HERMANOS LÓPEZ',
  'ALIMENTACIÓN PÉREZ',
  'ALIMENTACIÓN RODRÍGUEZ'
];

export default function CustomerVerification() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<CustomerToVerify[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      verifyCustomers();
    }
  }, [user]);

  const verifyCustomers = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: existingCustomers, error } = await supabase
        .from('customers')
        .select('id, name, company')
        .eq('created_by', user.id);

      if (error) {
        console.error('Error fetching customers:', error);
        toast.error('Error al verificar clientes existentes');
        return;
      }

      const verificationResults = CUSTOMERS_TO_VERIFY.map(customerName => {
        const existingCustomer = existingCustomers?.find(c => 
          c.name?.toLowerCase().includes(customerName.toLowerCase()) ||
          c.company?.toLowerCase().includes(customerName.toLowerCase())
        );
        
        return {
          name: customerName,
          exists: !!existingCustomer,
          id: existingCustomer?.id
        };
      });

      setCustomers(verificationResults);
      setVerificationComplete(true);
      
      const missingCount = verificationResults.filter(c => !c.exists).length;
      const existingCount = verificationResults.filter(c => c.exists).length;
      
      toast.success(`Verificación completada: ${existingCount} existentes, ${missingCount} faltantes`);
    } catch (error) {
      console.error('Error during verification:', error);
      toast.error(translations.customerVerification.verificationError);
    } finally {
      setLoading(false);
    }
  };

  const registerMissingCustomers = async () => {
    if (!user) return;
    
    const missingCustomers = customers.filter(c => !c.exists);
    if (missingCustomers.length === 0) {
      toast.info('No hay clientes faltantes para registrar');
      return;
    }

    setRegistering(true);
    try {
      const customersToInsert = missingCustomers.map(customer => ({
        name: customer.name,
        company: customer.name,
        created_by: user.id,
        country: 'España'
      }));

      const { data, error } = await supabase
        .from('customers')
        .insert(customersToInsert)
        .select();

      if (error) {
        console.error('Error inserting customers:', error);
        toast.error(translations.customerVerification.registrationError);
        return;
      }

      toast.success(`${missingCustomers.length} ${translations.customerVerification.registerSuccess}`);
      
      // Actualizar el estado para reflejar que ahora existen
      setCustomers(prev => prev.map(customer => {
        if (!customer.exists && missingCustomers.some(mc => mc.name === customer.name)) {
          const newCustomer = data?.find(d => d.name === customer.name);
          return {
            ...customer,
            exists: true,
            id: newCustomer?.id
          };
        }
        return customer;
      }));
      
    } catch (error) {
      console.error('Error during registration:', error);
      toast.error('Error durante el registro');
    } finally {
      setRegistering(false);
    }
  };

  // 新增：删除可能存在的匹配记录（按名称或公司名，当前用户 created_by）
  const deletePotentialMatches = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      const targetNames = (customers.length > 0 ? customers.map(c => c.name) : CUSTOMERS_TO_VERIFY);
      let totalDeleted = 0;

      for (const rawName of targetNames) {
        const name = rawName.trim();

        // 针对含有逗号的名稱，避免 PostgREST .or() 無法解析的問題：
        // 分別以 name 與 company 進行 ilike 查詢後合併刪除。
        const { data: nameMatches, error: nameErr } = await supabase
          .from('customers')
          .select('id')
          .eq('created_by', user.id)
          .ilike('name', `%${name}%`);
        if (nameErr) throw nameErr;

        const { data: companyMatches, error: companyErr } = await supabase
          .from('customers')
          .select('id')
          .eq('created_by', user.id)
          .ilike('company', `%${name}%`);
        if (companyErr) throw companyErr;

        const ids = Array.from(new Set([
          ...(nameMatches?.map((m: { id: string }) => m.id) || []),
          ...(companyMatches?.map((m: { id: string }) => m.id) || []),
        ]));

        if (ids.length > 0) {
          const { error: deleteError } = await supabase
            .from('customers')
            .delete()
            .in('id', ids);
          if (deleteError) throw deleteError;
          totalDeleted += ids.length;
        }
      }

      if (totalDeleted > 0) {
        toast.success(`Se eliminaron ${totalDeleted} registro(s) coincidentes de la base de datos`);
        await verifyCustomers();
      } else {
        toast.info('No se encontraron registros coincidentes para eliminar');
      }
    } catch (error: any) {
      console.error('Error al eliminar coincidencias:', error);
      toast.error(`Error al eliminar coincidencias${error?.message ? `: ${error.message}` : ''}`);
    } finally {
      setDeleting(false);
    }
  };

  const missingCustomers = customers.filter(c => !c.exists);
  const existingCustomers = customers.filter(c => c.exists);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Users className="h-6 w-6" />
          {translations.customerVerification.title}
        </h1>
        <p className="text-gray-600">
          {translations.customerVerification.subtitle}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Estado de Verificación</h2>
          <button
            onClick={verifyCustomers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {loading ? translations.customerVerification.verifying : translations.customerVerification.verifyButton}
          </button>
        </div>

        {verificationComplete && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-green-700 mb-3 flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              {translations.customerVerification.existingCustomers} ({existingCustomers.length})
            </h3>
              <div className="space-y-1">
                {existingCustomers.map((customer, index) => (
                  <div key={index} className="text-sm text-green-700">
                    ✓ {customer.name}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-red-700 mb-3 flex items-center gap-2">
                  <XCircle className="h-5 w-5" />
                  {translations.customerVerification.missingCustomers} ({missingCustomers.length})
                </h3>
              <div className="space-y-1">
                {missingCustomers.map((customer, index) => (
                  <div key={index} className="text-sm text-red-700">
                    ✗ {customer.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {missingCustomers.length > 0 && verificationComplete && (
          <div className="border-t pt-4 flex items-center gap-3 flex-wrap">
            <button
              onClick={registerMissingCustomers}
              disabled={registering}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {registering ? translations.customerVerification.registering : `${translations.customerVerification.registerButton} (${missingCustomers.length})`}
            </button>

            <button
              onClick={deletePotentialMatches}
              disabled={deleting}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Eliminando...' : 'Eliminar posibles coincidencias en BD'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Lista Completa de Clientes a Verificar</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {CUSTOMERS_TO_VERIFY.map((customerName, index) => {
            const customer = customers.find(c => c.name === customerName);
            return (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  customer?.exists
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : customer?.exists === false
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-gray-50 border-gray-200 text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {customer?.exists === true && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {customer?.exists === false && <XCircle className="h-4 w-4 text-red-600" />}
                  <span className="text-sm font-medium">{customerName}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}