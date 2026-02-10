import React, { useState } from 'react'
import Login from '../pages/Login'
import ForgotPassword from './ForgotPassword'

export default function AuthContainer() {
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  if (showForgotPassword) {
    return <ForgotPassword onBack={() => setShowForgotPassword(false)} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Login onForgotPassword={() => setShowForgotPassword(true)} />
    </div>
  )
}