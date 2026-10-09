import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
export default function Customers() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState([])

  useEffect(() => {
    apiFetch(`/api/customers/${user.businessId}`)
      .then((response) => response.json())
      .then((data) => setCustomers(data))
      .catch((error) => console.error(error))
  }, [user.businessId])

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Customers</h2>
          <p>View customer contact information in one place.</p>
        </div>

        <Link className="primary-button" to="/search?add=customer">+ Add Customer</Link>
      </div>

      <div className="content-card table-card">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Date Added</th>
            </tr>
          </thead>

          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <strong>{customer.name}</strong>
                </td>

                <td>{customer.phone}</td>
                <td>{customer.email}</td>

                <td>
                  {new Date(customer.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
