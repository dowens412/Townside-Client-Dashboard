import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
export default function Jobs() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])

  useEffect(() => {
    apiFetch(`/api/jobs/${user.businessId}`)
      .then((response) => response.json())
      .then((data) => setJobs(data))
      .catch((error) => console.error(error))
  }, [user.businessId])

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Jobs</h2>
          <p>Keep track of scheduled and completed customer work.</p>
        </div>

        <Link className="primary-button" to="/search?add=job">+ Add Job</Link>
      </div>

      <div className="content-card table-card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Service</th>
              <th>Status</th>
              <th>Job Value</th>
              <th>Scheduled</th>
            </tr>
          </thead>

          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <strong>{job.customer_name}</strong>
                </td>

                <td>{job.service}</td>

                <td>
                  <span className="status-badge">{job.status}</span>
                </td>

                <td>${Number(job.job_value).toLocaleString()}</td>

                <td>{job.scheduled_date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
