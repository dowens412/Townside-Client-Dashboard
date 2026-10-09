import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
// Client-side validation gives the user immediate feedback.
// The backend repeats these checks before saving the password.
function passwordIsValid(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

export default function Register() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({
    name: '',
    businessName: '',
    email: '',
    password: '',
    confirmPassword: ''
  })

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const updateField = (event) => {
    setForm({
      ...form,
      [event.target.name]: event.target.value
    })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (!passwordIsValid(form.password)) {
      setError(
        'Password does not meet the required complexity rules.'
      )
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch(
        '/api/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: form.name,
            businessName: form.businessName,
            email: form.email,
            password: form.password
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to create account.')
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
    <div className="registration-page">
      <div className="registration-card">
        <div className="login-brand">
          <div className="brand-mark large">TW</div>
          <h1>Create Account</h1>
          <p>Set up your Townside Web client portal.</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <label>Your Name</label>
            <input
              name="name"
              value={form.name}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Business Name</label>
            <input
              name="businessName"
              value={form.businessName}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Email Address</label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Password</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              required
            />
          </div>

          <div>
            <label>Confirm Password</label>
            <input
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={updateField}
              required
            />
          </div>

          <div className="password-rules">
            <strong>Password Requirements</strong>
            <span>At least 8 characters</span>
            <span>At least one uppercase letter</span>
            <span>At least one lowercase letter</span>
            <span>At least one number</span>
            <span>At least one special character</span>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-link">
          Already have an account? <Link to="/">Sign In</Link>
        </p>
      </div>
    </div>
  )
}
