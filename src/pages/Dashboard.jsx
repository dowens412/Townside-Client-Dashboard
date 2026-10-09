import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
export default function Dashboard() {
  const { user } = useAuth()

  const [stats, setStats] = useState({
    newLeads: 0,
    openEstimates: 0,
    jobs: 0,
    potentialValue: 0
  })

  useEffect(() => {
    apiFetch(`/api/dashboard/${user.businessId}`)
      .then((response) => response.json())
      .then((data) => setStats(data))
      .catch((error) => console.error(error))
  }, [user.businessId])

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Dashboard</h2>
          <p>Here is a quick look at what is happening with your business.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span>New Leads</span>
          <strong>{stats.newLeads}</strong>
          <small>Waiting for attention</small>
        </div>

        <div className="stat-card">
          <span>Open Estimates</span>
          <strong>{stats.openEstimates}</strong>
          <small>Currently outstanding</small>
        </div>

        <div className="stat-card">
          <span>Jobs</span>
          <strong>{stats.jobs}</strong>
          <small>Tracked in the system</small>
        </div>

        <div className="stat-card">
          <span>Potential Value</span>
          <strong>
            ${Number(stats.potentialValue).toLocaleString()}
          </strong>
          <small>Value of active leads</small>
        </div>
      </div>

      <div className="content-card">
        <div className="card-heading">
          <h3>Needs Attention</h3>
          <p>Items that may need a response or follow-up.</p>
        </div>

        <div className="attention-list">
          <div className="attention-item">
            <span className="status-dot red"></span>

            <div>
              <strong>New lead waiting for a response</strong>
              <p>Review the Leads page and contact the newest request.</p>
            </div>
          </div>

          <div className="attention-item">
            <span className="status-dot yellow"></span>

            <div>
              <strong>Estimate needs follow-up</strong>
              <p>An estimate has been sent and is still open.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
