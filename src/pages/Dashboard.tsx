import React, { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  Users,
  Calendar,
  MapPin,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Plus
} from 'lucide-react'

interface DashboardStats {
  totalCustomers: number
  todayVisits: number
  pendingVisits: number
  completedVisits: number
  thisWeekVisits: number
  thisMonthCustomers: number
}

export default function Dashboard() {
  const { customers, visits, setCurrentPage } = useStore()
  const { user } = useAuth()
  const [stats, setStats] = useState<DashboardStats>({
    totalCustomers: 0,
    todayVisits: 0,
    pendingVisits: 0,
    completedVisits: 0,
    thisWeekVisits: 0,
    thisMonthCustomers: 0
  })
  const [loading, setLoading] = useState(true)
  const t = translations

  useEffect(() => {
    if (!user?.id) return
    loadDashboardData()
  }, [user?.id])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // 调试信息：输出用户ID
      console.log('Dashboard Debug - User ID:', user?.id)
      console.log('Dashboard Debug - User object:', user)
      
      if (!user?.id) {
        setStats({
          totalCustomers: 0,
          todayVisits: 0,
          pendingVisits: 0,
          completedVisits: 0,
          thisWeekVisits: 0,
          thisMonthCustomers: 0
        })
        setLoading(false)
        return
      }
      
      // Obtener estadísticas de clientes
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('created_by', user.id)
      
      // 调试信息：输出客户数据查询结果
      console.log('Dashboard Debug - Customers query result:', { customersData, customersError })
      
      // Obtener estadísticas de visitas
      const { data: visitsData, error: visitsError } = await supabase
        .from('visits')
        .select('*')
        .eq('user_id', user.id)
      
      // 调试信息：输出访问数据查询结果
      console.log('Dashboard Debug - Visits query result:', { visitsData, visitsError })
      
      const today = new Date()
      const startOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay())
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const todayStr = new Date().toISOString().split('T')[0]
      
      const getVisitDateIso = (visit: any): string | null => {
        const v = visit.scheduled_date || visit.scheduled_at || null
        if (!v) return null
        try {
          return typeof v === 'string' ? v : new Date(v).toISOString()
        } catch {
          return null
        }
      }
      
      const todayVisits = (visitsData || []).filter(visit => {
        const iso = getVisitDateIso(visit)
        return iso ? iso.startsWith(todayStr) : false
      }).length
      
      const pendingVisits = (visitsData || []).filter(visit => 
        visit.status === 'pending' || visit.status === 'programada'
      ).length
      
      const completedVisits = (visitsData || []).filter(visit => 
        visit.status === 'completed' || visit.status === 'completada'
      ).length
      
      const thisWeekVisits = (visitsData || []).filter(visit => {
        const iso = getVisitDateIso(visit)
        if (!iso) return false
        const visitDate = new Date(iso)
        return visitDate >= startOfWeek
      }).length
      
      const thisMonthCustomers = (customersData || []).filter(customer => {
        const createdDate = new Date(customer.created_at || '')
        return createdDate >= startOfMonth
      }).length
      
      const finalStats = {
        totalCustomers: customersData?.length || 0,
        todayVisits,
        pendingVisits,
        completedVisits,
        thisWeekVisits,
        thisMonthCustomers
      }
      
      // 调试信息：输出最终统计结果
      console.log('Dashboard Debug - Final stats:', finalStats)
      
      setStats(finalStats)
    } catch (error) {
      console.error('Error loading dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const quickActions = [
    {
      title: t.dashboard.addCustomer,
      description: t.dashboard.addCustomerDesc,
      icon: Users,
      color: 'bg-blue-500',
      action: () => setCurrentPage('customers')
    },
    {
      title: t.dashboard.scheduleVisit,
      description: t.dashboard.scheduleVisitDesc,
      icon: Calendar,
      color: 'bg-green-500',
      action: () => setCurrentPage('visits')
    },
    {
      title: t.dashboard.viewMap,
      description: t.dashboard.viewMapDesc,
      icon: MapPin,
      color: 'bg-purple-500',
      action: () => setCurrentPage('map')
    }
  ]

  const statCards = [
    {
      title: t.dashboard.totalCustomers,
      value: stats.totalCustomers,
      icon: Users,
      color: 'bg-blue-500',
      change: `+${stats.thisMonthCustomers} ${t.dashboard.thisMonth}`
    },
    {
      title: t.dashboard.todayVisits,
      value: stats.todayVisits,
      icon: Calendar,
      color: 'bg-green-500',
      change: `${stats.thisWeekVisits} ${t.dashboard.thisWeek}`
    },
    {
      title: t.dashboard.pendingVisits,
      value: stats.pendingVisits,
      icon: Clock,
      color: 'bg-yellow-500',
      change: t.dashboard.pending
    },
    {
      title: t.dashboard.completedVisits,
      value: stats.completedVisits,
      icon: CheckCircle,
      color: 'bg-emerald-500',
      change: t.dashboard.completed
    }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Saludo */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-xl p-6 text-white">
        <h1 className="text-2xl font-bold mb-2">
          {t.dashboard.welcome}, {user?.user_metadata?.full_name || t.common.user}!
        </h1>
        <p className="text-blue-100">
          {t.dashboard.welcomeMessage}
        </p>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon
          return (
            <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{card.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{card.change}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Acciones rápidas */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t.dashboard.quickActions}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action, index) => {
            const Icon = action.icon
            return (
              <button
                key={index}
                onClick={action.action}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center space-x-3 mb-2">
                  <div className={`${action.color} p-2 rounded-lg group-hover:scale-110 transition-transform`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-medium text-gray-900">{action.title}</h3>
                </div>
                <p className="text-sm text-gray-600">{action.description}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {t.dashboard.recentActivity}
        </h2>
        {stats.todayVisits > 0 || stats.pendingVisits > 0 ? (
          <div className="space-y-3">
            {stats.todayVisits > 0 && (
              <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm text-green-800">
                  {t.dashboard.todayVisitsCount.replace('{count}', stats.todayVisits.toString())}
                </span>
              </div>
            )}
            {stats.pendingVisits > 0 && (
              <div className="flex items-center space-x-3 p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                <span className="text-sm text-yellow-800">
                  {t.dashboard.pendingVisitsCount.replace('{count}', stats.pendingVisits.toString())}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">{t.dashboard.noActivity}</p>
            <button
              onClick={() => setCurrentPage('visits')}
              className="mt-3 inline-flex items-center space-x-2 text-blue-600 hover:text-blue-800 font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>{t.dashboard.scheduleFirstVisit}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}