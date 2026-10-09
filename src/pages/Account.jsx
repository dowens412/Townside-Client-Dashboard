import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
function passwordIsValid(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

export default function Account() {
  const { user } = useAuth()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Verify the current password before storing a new hashed password.
  const handlePasswordChange = async (event) => {
    event.preventDefault()

    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (!passwordIsValid(newPassword)) {
      setError(
        'New password does not meet the required complexity rules.'
      )
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch(
        '/api/change-password',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: user.id,
            currentPassword,
            newPassword
          })
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to change password.')
      }

      setSuccess(data.message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Account</h2>
          <p>View your account and update your password.</p>
        </div>
      </div>

      <div className="account-grid">
        <div className="content-card account-details">
          <h3>Account Information</h3>

          <div>
            <span>Name</span>
            <strong>{user.name}</strong>
          </div>

          <div>
            <span>Email</span>
            <strong>{user.email}</strong>
          </div>

          <div>
            <span>Business</span>
            <strong>{user.businessName}</strong>
          </div>
        </div>

        <div className="content-card">
          <h3>Change Password</h3>

          <form
            className="account-form"
            onSubmit={handlePasswordChange}
          >
            <div>
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) =>
                  setCurrentPassword(event.target.value)
                }
                required
              />
            </div>

            <div>
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(event) =>
                  setNewPassword(event.target.value)
                }
                required
              />
            </div>

            <div>
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) =>
                  setConfirmPassword(event.target.value)
                }
                required
              />
            </div>

            <div className="password-rules">
              <strong>Password Requirements</strong>
              <span>At least 8 characters</span>
              <span>Uppercase and lowercase letters</span>
              <span>At least one number</span>
              <span>At least one special character</span>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}

            {success && (
              <div className="success-message">{success}</div>
            )}

            <button
              className="primary-button"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}
