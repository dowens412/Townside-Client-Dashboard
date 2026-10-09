import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('demo@townsidewebs.com')
  const [password, setPassword] = useState('Townside123!')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Submit credentials to the backend for database verification.
  const handleSubmit = async (event) => {
    event.preventDefault()

    setError('')
    setLoading(true)

    try {
      const response = await apiFetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to sign in.')
      }

      login(data.user, data.token)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-panel">
        <div className="login-brand">
          <div className="brand-mark large">TW</div>
          <h1>Townside Web</h1>
          <p>Client Lead & Job Dashboard</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="auth-link">
          Need an account? <Link to="/register">Create Account</Link>
        </p>

        <div className="demo-login">
          <strong>Demo Account</strong>
          <span>demo@townsidewebs.com</span>
          <span>Townside123!</span>
        </div>
      </div>

      <div className="login-feature">
        <div className="login-feature-content">
          <p className="eyebrow light">Townside Web Client Portal</p>

          <h2>
            Keep your leads, customers, and jobs organized in one place.
          </h2>

          <p>
            A simple dashboard designed for service businesses that need to
            know what needs attention without digging through a complicated
            system.
          </p>

          <div className="feature-grid">
            <div>
              <strong>Leads</strong>
              <span>Track every opportunity</span>
            </div>

            <div>
              <strong>Jobs</strong>
              <span>See scheduled and completed work</span>
            </div>

            <div>
              <strong>Customers</strong>
              <span>Keep contact information together</span>
            </div>

            <div>
              <strong>Search</strong>
              <span>Quickly find the records you need</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
