import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

import { apiFetch } from '../lib/api'
const emptyForm = {
  recordType: 'lead',
  name: '',
  phone: '',
  email: '',
  service: '',
  status: 'New Lead',
  value: '',
  notes: '',
  scheduledDate: ''
}

export default function Search() {
  const { user } = useAuth()

  const addType = new URLSearchParams(window.location.search).get('add')

  const requestedType =
    ['lead', 'job', 'customer'].includes(addType)
      ? addType
      : 'lead'

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  const [showForm, setShowForm] = useState(Boolean(addType))
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({
    ...emptyForm,
    recordType: requestedType,
    status:
      requestedType === 'job'
        ? 'Scheduled'
        : requestedType === 'lead'
          ? 'New Lead'
          : ''
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Run the Phase 2 search and refresh the displayed results.
  const runSearch = async (searchValue = query) => {
    const value = searchValue.trim()

    if (!value) {
      return
    }

    setLoading(true)

    try {
      const response = await apiFetch(
        `/api/search/${user.businessId}?q=${encodeURIComponent(value)}`
      )

      const data = await response.json()

      setResults(data)
      setSearched(true)
    } catch (searchError) {
      console.error(searchError)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async (event) => {
    event.preventDefault()
    await runSearch()
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setSearched(false)
  }

  const updateField = (event) => {
    const { name, value } = event.target

    setForm((current) => {
      if (name === 'recordType') {
        return {
          ...current,
          recordType: value,
          status:
            value === 'job'
              ? 'Scheduled'
              : value === 'lead'
                ? 'New Lead'
                : ''
        }
      }

      return {
        ...current,
        [name]: value
      }
    })
  }

  // Open a blank form for adding a new record.
  const startAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setMessage('')
    setError('')
    setShowForm(true)
  }

  // Load the selected search result into the edit form.
  const startEdit = (record) => {
    setEditingId(record.id)

    setForm({
      recordType: record.recordType,
      name: record.title || '',
      phone: record.phone || '',
      email: record.email || '',
      service: record.details || '',
      status:
        record.status ||
        (record.recordType === 'job' ? 'Scheduled' : 'New Lead'),
      value:
        record.value === null || record.value === undefined
          ? ''
          : record.value,
      notes: record.notes || '',
      scheduledDate: record.scheduledDate || ''
    })

    setMessage('')
    setError('')
    setShowForm(true)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  // Add or edit a record using the same form.
  const saveRecord = async (event) => {
    event.preventDefault()

    setError('')
    setMessage('')

    const url = editingId
      ? `/api/records/${form.recordType}/${editingId}`
      : `/api/records/${form.recordType}`

    const method = editingId ? 'PUT' : 'POST'

    try {
      const response = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...form,
          businessId: user.businessId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to save record.')
      }

      setMessage(data.message)
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)

      // Showing all records immediately makes the change visible,
      // which is required for Phase 3.
      setQuery('*')
      await runSearch('*')
    } catch (saveError) {
      setError(saveError.message)
    }
  }

  // Delete a result and immediately refresh the Search page.
  const deleteRecord = async (record) => {
    const confirmed = window.confirm(
      `Delete this ${record.type.toLowerCase()} record for ${record.title}?`
    )

    if (!confirmed) {
      return
    }

    setMessage('')
    setError('')

    try {
      const response = await apiFetch(
        `/api/records/${record.recordType}/${record.id}?businessId=${user.businessId}`,
        {
          method: 'DELETE'
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Unable to delete record.')
      }

      setMessage(data.message)

      if (query.trim()) {
        await runSearch(query)
      }
    } catch (deleteError) {
      setError(deleteError.message)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <h2>Search</h2>
          <p>
            Search, add, edit, and delete your leads, jobs, and customers.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={startAdd}
        >
          + Add Record
        </button>
      </div>

      {message && (
        <div className="success-message phase-message">
          {message}
        </div>
      )}

      {error && (
        <div className="error-message phase-message">
          {error}
        </div>
      )}

      {showForm && (
        <div className="content-card record-form-card">
          <div className="record-form-heading">
            <div>
              <h3>
                {editingId ? 'Edit Record' : 'Add Record'}
              </h3>

              <p>
                {editingId
                  ? 'Update the record and save your changes.'
                  : 'Choose a record type and enter the information below.'}
              </p>
            </div>
          </div>

          <form
            className="record-form"
            onSubmit={saveRecord}
          >
            <div>
              <label>Record Type</label>

              <select
                name="recordType"
                value={form.recordType}
                onChange={updateField}
                disabled={Boolean(editingId)}
              >
                <option value="lead">Lead</option>
                <option value="job">Job</option>
                <option value="customer">Customer</option>
              </select>
            </div>

            <div>
              <label>
                {form.recordType === 'customer'
                  ? 'Customer Name'
                  : 'Customer Name'}
              </label>

              <input
                name="name"
                value={form.name}
                onChange={updateField}
                required
              />
            </div>

            {(form.recordType === 'lead' ||
              form.recordType === 'customer') && (
              <>
                <div>
                  <label>Phone</label>

                  <input
                    name="phone"
                    value={form.phone}
                    onChange={updateField}
                  />
                </div>

                <div>
                  <label>Email</label>

                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={updateField}
                  />
                </div>
              </>
            )}

            {(form.recordType === 'lead' ||
              form.recordType === 'job') && (
              <>
                <div>
                  <label>Service</label>

                  <input
                    name="service"
                    value={form.service}
                    onChange={updateField}
                  />
                </div>

                <div>
                  <label>Status</label>

                  <select
                    name="status"
                    value={form.status}
                    onChange={updateField}
                  >
                    {form.recordType === 'lead' ? (
                      <>
                        <option>New Lead</option>
                        <option>Contacted</option>
                        <option>Estimate Sent</option>
                        <option>Won</option>
                        <option>Lost</option>
                      </>
                    ) : (
                      <>
                        <option>Scheduled</option>
                        <option>In Progress</option>
                        <option>Completed</option>
                        <option>Cancelled</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label>
                    {form.recordType === 'lead'
                      ? 'Estimated Value'
                      : 'Job Value'}
                  </label>

                  <input
                    name="value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.value}
                    onChange={updateField}
                  />
                </div>
              </>
            )}

            {form.recordType === 'lead' && (
              <div className="record-form-wide">
                <label>Notes</label>

                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={updateField}
                  rows="3"
                />
              </div>
            )}

            {form.recordType === 'job' && (
              <div>
                <label>Scheduled Date</label>

                <input
                  name="scheduledDate"
                  type="date"
                  value={form.scheduledDate}
                  onChange={updateField}
                />
              </div>
            )}

            <div className="record-form-actions">
              <button
                className="primary-button"
                type="submit"
              >
                {editingId ? 'Save Changes' : 'Add Record'}
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={cancelForm}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="content-card search-card">
        <div className="search-help">
          <strong>How to Search</strong>

          <p>
            Enter a customer name, service, email, phone number, or status.
            You can also use <strong>*</strong> as a wildcard for multiple
            characters and <strong>?</strong> for one character.
          </p>

          <p>
            Example: <strong>*wash*</strong> returns records containing
            words such as House Washing.
          </p>
        </div>

        <form
          className="search-controls"
          onSubmit={handleSearch}
        >
          <input
            type="text"
            placeholder="Search your records..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            required
          />

          <button
            className="primary-button"
            type="submit"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>

          <button
            className="secondary-button"
            type="button"
            onClick={clearSearch}
          >
            Clear
          </button>
        </form>
      </div>

      {searched && (
        <div className="content-card table-card search-results">
          <div className="search-result-heading">
            <strong>
              {results.length} result
              {results.length === 1 ? '' : 's'} found
            </strong>
          </div>

          {results.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Details</th>
                  <th>Status</th>
                  <th>Value</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {results.map((result) => (
                  <tr key={`${result.recordType}-${result.id}`}>
                    <td>
                      <span className="result-type">
                        {result.type}
                      </span>
                    </td>

                    <td>
                      <strong>{result.title}</strong>
                    </td>

                    <td>{result.details || '—'}</td>
                    <td>{result.status || '—'}</td>

                    <td>
                      {result.value === null
                        ? '—'
                        : `$${Number(result.value).toLocaleString()}`}
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          className="edit-button"
                          type="button"
                          onClick={() => startEdit(result)}
                        >
                          Edit
                        </button>

                        <button
                          className="delete-button"
                          type="button"
                          onClick={() => deleteRecord(result)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-search">
              No matching records were found.
            </div>
          )}
        </div>
      )}
    </>
  )
}
