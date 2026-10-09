import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
export default function Leads() {
  const { user } = useAuth()
  const [leads, setLeads] = useState([])

  useEffect(() => {
    apiFetch(`/api/leads/${user.businessId}`)
      .then((response) => response.json())
      .then((data) => setLeads(data))
      .catch((error) => console.error(error))
  }, [user.businessId])

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Leads</h2>
          <p>View potential customers and track where they are in the process.</p>
        </div>

        <Link className="primary-button" to="/search?add=lead">+ Add Lead</Link>
      </div>

      <div className="content-card table-card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Service</th>
              <th>Status</th>
              <th>Estimated Value</th>
              <th>Phone</th>
            </tr>
          </thead>

          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <strong>{lead.customer_name}</strong>
                  <span>{lead.email}</span>
                </td>

                <td>{lead.service}</td>

                <td>
                  <span className="status-badge">{lead.status}</span>
                </td>

                <td>
                  ${Number(lead.estimated_value).toLocaleString()}
                </td>

                <td>{lead.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
