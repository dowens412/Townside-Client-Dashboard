import process from 'node:process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import pg from 'pg'

dotenv.config()

const { Pool } = pg

const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET
const DATABASE_URL = process.env.DATABASE_URL

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CLIENT_DIST = path.resolve(__dirname, '..', 'dist')

if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is missing. Add it to the .env file before starting the server.'
  )
}

if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is missing. Add the Supabase connection string to .env.'
  )
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
})

const app = express()

app.disable('x-powered-by')
app.use(helmet())

const allowedOrigins = [
  process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  'http://127.0.0.1:5173'
]

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }

      return callback(new Error('Origin not allowed by CORS'))
    }
  })
)

app.use(express.json({ limit: '50kb' }))

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts. Please try again later.'
  }
})

app.use('/api', apiLimiter)

function issueToken(user) {
  return jwt.sign(
    {
      userId: Number(user.id),
      businessId: Number(user.businessId),
      role: user.role || 'client'
    },
    JWT_SECRET,
    {
      expiresIn: '8h'
    }
  )
}

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || ''
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      message: 'Authentication is required.'
    })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)

    const result = await pool.query(
      `
        SELECT
          id,
          business_id,
          role,
          is_active
        FROM public.users
        WHERE id = $1
        LIMIT 1
      `,
      [Number(payload.userId)]
    )

    const user = result.rows[0]

    if (!user || !user.is_active) {
      return res.status(401).json({
        message: 'Authentication is no longer valid.'
      })
    }

    req.auth = {
      userId: Number(user.id),
      businessId: Number(user.business_id),
      role: user.role
    }

    next()
  } catch {
    return res.status(401).json({
      message: 'Authentication is invalid or has expired.'
    })
  }
}

function passwordIsValid(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

function makeSlug(value) {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return base || `business-${Date.now()}`
}

async function createUniqueSlug(client, businessName) {
  const base = makeSlug(businessName)
  let slug = base
  let counter = 2

  while (true) {
    const existing = await client.query(
      `
        SELECT id
        FROM public.businesses
        WHERE slug = $1
        LIMIT 1
      `,
      [slug]
    )

    if (existing.rowCount === 0) {
      return slug
    }

    slug = `${base}-${counter}`
    counter += 1
  }
}

async function addActivity({
  businessId,
  userId = null,
  actorType = 'user',
  entityType,
  entityId = null,
  action,
  description = null,
  metadata = {}
}) {
  try {
    await pool.query(
      `
        INSERT INTO public.activity_log
        (
          business_id,
          user_id,
          actor_type,
          entity_type,
          entity_id,
          action,
          description,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      `,
      [
        businessId,
        userId,
        actorType,
        entityType,
        entityId,
        action,
        description,
        JSON.stringify(metadata)
      ]
    )
  } catch (error) {
    console.error('Unable to write activity log:', error.message)
  }
}

/* =========================================================
   HEALTH
   ========================================================= */

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        NOW() AS server_time,
        current_database() AS database_name
    `)

    res.json({
      ok: true,
      database: result.rows[0].database_name,
      serverTime: result.rows[0].server_time
    })
  } catch {
    res.status(503).json({
      ok: false,
      message: 'Database connection is unavailable.'
    })
  }
})

/* =========================================================
   AUTHENTICATION
   ========================================================= */

app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      })
    }

    const result = await pool.query(
      `
        SELECT
          users.id,
          users.name,
          users.email,
          users.password_hash,
          users.business_id,
          users.role,
          users.is_active,
          businesses.name AS business_name
        FROM public.users
        JOIN public.businesses
          ON businesses.id = users.business_id
        WHERE LOWER(users.email) = LOWER($1)
        LIMIT 1
      `,
      [email.trim()]
    )

    const user = result.rows[0]

    if (
      !user ||
      !user.is_active ||
      !bcrypt.compareSync(password, user.password_hash)
    ) {
      return res.status(401).json({
        message: 'Invalid email or password.'
      })
    }

    await pool.query(
      `
        UPDATE public.users
        SET last_login_at = NOW()
        WHERE id = $1
      `,
      [user.id]
    )

    const publicUser = {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      businessId: Number(user.business_id),
      businessName: user.business_name,
      role: user.role
    }

    res.json({
      user: publicUser,
      token: issueToken(publicUser)
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({
      message: 'Unable to log in.'
    })
  }
})

app.post('/api/register', authLimiter, async (req, res) => {
  const client = await pool.connect()

  try {
    const {
      name,
      businessName,
      email,
      password
    } = req.body

    if (!name || !businessName || !email || !password) {
      return res.status(400).json({
        message: 'All registration fields are required.'
      })
    }

    if (!passwordIsValid(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.'
      })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const existingUser = await client.query(
      `
        SELECT id
        FROM public.users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [normalizedEmail]
    )

    if (existingUser.rowCount > 0) {
      return res.status(409).json({
        message: 'An account with that email already exists.'
      })
    }

    await client.query('BEGIN')

    const slug = await createUniqueSlug(client, businessName)

    const businessResult = await client.query(
      `
        INSERT INTO public.businesses
        (
          name,
          slug,
          status
        )
        VALUES ($1, $2, 'active')
        RETURNING id, name
      `,
      [
        businessName.trim(),
        slug
      ]
    )

    const business = businessResult.rows[0]
    const passwordHash = bcrypt.hashSync(password, 12)

    const userResult = await client.query(
      `
        INSERT INTO public.users
        (
          business_id,
          name,
          email,
          password_hash,
          role,
          is_active
        )
        VALUES ($1, $2, $3, $4, 'owner', TRUE)
        RETURNING
          id,
          business_id,
          name,
          email,
          role
      `,
      [
        business.id,
        name.trim(),
        normalizedEmail,
        passwordHash
      ]
    )

    await client.query('COMMIT')

    const user = userResult.rows[0]

    const publicUser = {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      businessId: Number(user.business_id),
      businessName: business.name,
      role: user.role
    }

    await addActivity({
      businessId: publicUser.businessId,
      userId: publicUser.id,
      entityType: 'business',
      entityId: publicUser.businessId,
      action: 'business_registered',
      description: 'Business account created.'
    })

    res.status(201).json({
      user: publicUser,
      token: issueToken(publicUser)
    })
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Ignore rollback failure.
    }

    console.error('Registration error:', error)

    res.status(500).json({
      message: 'Unable to create account.'
    })
  } finally {
    client.release()
  }
})

app.post('/api/change-password', requireAuth, async (req, res) => {
  try {
    const {
      currentPassword,
      newPassword
    } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current and new passwords are required.'
      })
    }

    if (!passwordIsValid(newPassword)) {
      return res.status(400).json({
        message:
          'New password must be at least 8 characters and include uppercase, lowercase, a number, and a special character.'
      })
    }

    const result = await pool.query(
      `
        SELECT id, password_hash
        FROM public.users
        WHERE id = $1
        LIMIT 1
      `,
      [req.auth.userId]
    )

    const user = result.rows[0]

    if (
      !user ||
      !bcrypt.compareSync(currentPassword, user.password_hash)
    ) {
      return res.status(401).json({
        message: 'Current password is incorrect.'
      })
    }

    const newHash = bcrypt.hashSync(newPassword, 12)

    await pool.query(
      `
        UPDATE public.users
        SET password_hash = $1
        WHERE id = $2
      `,
      [
        newHash,
        user.id
      ]
    )

    await addActivity({
      businessId: req.auth.businessId,
      userId: req.auth.userId,
      entityType: 'user',
      entityId: req.auth.userId,
      action: 'password_changed'
    })

    res.json({
      message: 'Password changed successfully.'
    })
  } catch (error) {
    console.error('Password change error:', error)

    res.status(500).json({
      message: 'Unable to change password.'
    })
  }
})

/* =========================================================
   SEARCH
   ========================================================= */

app.get('/api/search/:businessId', requireAuth, async (req, res) => {
  try {
    const businessId = req.auth.businessId
    const query = String(req.query.q || '').trim()

    if (!query) {
      return res.json([])
    }

    let pattern = query
      .replace(/\*/g, '%')
      .replace(/\?/g, '_')

    if (
      !query.includes('*') &&
      !query.includes('?') &&
      !query.includes('%') &&
      !query.includes('_')
    ) {
      pattern = `%${pattern}%`
    }

    const leadsResult = await pool.query(
      `
        SELECT
          id,
          'lead' AS "recordType",
          'Lead' AS type,
          customer_name AS title,
          COALESCE(service, '') AS details,
          status,
          estimated_value::float8 AS value,
          COALESCE(phone, '') AS phone,
          COALESCE(email, '') AS email,
          COALESCE(notes, '') AS notes,
          NULL::text AS "scheduledDate"
        FROM public.leads
        WHERE business_id = $1
          AND deleted_at IS NULL
          AND (
            customer_name ILIKE $2
            OR COALESCE(phone, '') ILIKE $2
            OR COALESCE(email, '') ILIKE $2
            OR COALESCE(service, '') ILIKE $2
            OR status ILIKE $2
            OR COALESCE(notes, '') ILIKE $2
          )
        ORDER BY id DESC
      `,
      [businessId, pattern]
    )

    const jobsResult = await pool.query(
      `
        SELECT
          id,
          'job' AS "recordType",
          'Job' AS type,
          customer_name AS title,
          COALESCE(service, '') AS details,
          status,
          job_value::float8 AS value,
          ''::text AS phone,
          ''::text AS email,
          COALESCE(notes, '') AS notes,
          scheduled_date::text AS "scheduledDate"
        FROM public.jobs
        WHERE business_id = $1
          AND deleted_at IS NULL
          AND (
            customer_name ILIKE $2
            OR COALESCE(service, '') ILIKE $2
            OR status ILIKE $2
            OR COALESCE(scheduled_date::text, '') ILIKE $2
          )
        ORDER BY id DESC
      `,
      [businessId, pattern]
    )

    const customersResult = await pool.query(
      `
        SELECT
          id,
          'customer' AS "recordType",
          'Customer' AS type,
          name AS title,
          COALESCE(email, phone, '') AS details,
          ''::text AS status,
          NULL::float8 AS value,
          COALESCE(phone, '') AS phone,
          COALESCE(email, '') AS email,
          COALESCE(notes, '') AS notes,
          NULL::text AS "scheduledDate"
        FROM public.customers
        WHERE business_id = $1
          AND deleted_at IS NULL
          AND (
            name ILIKE $2
            OR COALESCE(phone, '') ILIKE $2
            OR COALESCE(email, '') ILIKE $2
          )
        ORDER BY id DESC
      `,
      [businessId, pattern]
    )

    res.json([
      ...leadsResult.rows,
      ...jobsResult.rows,
      ...customersResult.rows
    ])
  } catch (error) {
    console.error('Search error:', error)

    res.status(500).json({
      message: 'Unable to search records.'
    })
  }
})

/* =========================================================
   CREATE RECORDS
   ========================================================= */

app.post('/api/records/:type', requireAuth, async (req, res) => {
  try {
    const type = req.params.type
    const data = req.body
    const businessId = req.auth.businessId

    if (!data.name?.trim()) {
      return res.status(400).json({
        message: 'Customer name is required.'
      })
    }

    if (type === 'lead') {
      const result = await pool.query(
        `
          INSERT INTO public.leads
          (
            business_id,
            customer_name,
            phone,
            email,
            service,
            status,
            estimated_value,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
        [
          businessId,
          data.name.trim(),
          data.phone || null,
          data.email || null,
          data.service || null,
          data.status || 'New Lead',
          Number(data.value) || 0,
          data.notes || null
        ]
      )

      const id = Number(result.rows[0].id)

      await addActivity({
        businessId,
        userId: req.auth.userId,
        entityType: 'lead',
        entityId: id,
        action: 'lead_created',
        description: `Lead created for ${data.name.trim()}.`
      })

      return res.status(201).json({
        id,
        message: 'Lead added successfully.'
      })
    }

    if (type === 'job') {
      const result = await pool.query(
        `
          INSERT INTO public.jobs
          (
            business_id,
            customer_name,
            service,
            status,
            job_value,
            scheduled_date,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
        [
          businessId,
          data.name.trim(),
          data.service || null,
          data.status || 'Scheduled',
          Number(data.value) || 0,
          data.scheduledDate || null,
          data.notes || null
        ]
      )

      const id = Number(result.rows[0].id)

      await addActivity({
        businessId,
        userId: req.auth.userId,
        entityType: 'job',
        entityId: id,
        action: 'job_created',
        description: `Job created for ${data.name.trim()}.`
      })

      return res.status(201).json({
        id,
        message: 'Job added successfully.'
      })
    }

    if (type === 'customer') {
      const result = await pool.query(
        `
          INSERT INTO public.customers
          (
            business_id,
            name,
            phone,
            email
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [
          businessId,
          data.name.trim(),
          data.phone || null,
          data.email || null
        ]
      )

      const id = Number(result.rows[0].id)

      await addActivity({
        businessId,
        userId: req.auth.userId,
        entityType: 'customer',
        entityId: id,
        action: 'customer_created',
        description: `Customer created: ${data.name.trim()}.`
      })

      return res.status(201).json({
        id,
        message: 'Customer added successfully.'
      })
    }

    res.status(400).json({
      message: 'Invalid record type.'
    })
  } catch (error) {
    console.error('Create record error:', error)

    res.status(500).json({
      message: 'Unable to create record.'
    })
  }
})

/* =========================================================
   UPDATE RECORDS
   ========================================================= */

app.put('/api/records/:type/:id', requireAuth, async (req, res) => {
  try {
    const type = req.params.type
    const id = Number(req.params.id)
    const data = req.body
    const businessId = req.auth.businessId

    if (!id) {
      return res.status(400).json({
        message: 'Invalid record information.'
      })
    }

    let result

    if (type === 'lead') {
      result = await pool.query(
        `
          UPDATE public.leads
          SET
            customer_name = $1,
            phone = $2,
            email = $3,
            service = $4,
            status = $5,
            estimated_value = $6,
            notes = $7
          WHERE id = $8
            AND business_id = $9
            AND deleted_at IS NULL
          RETURNING id
        `,
        [
          data.name || '',
          data.phone || null,
          data.email || null,
          data.service || null,
          data.status || 'New Lead',
          Number(data.value) || 0,
          data.notes || null,
          id,
          businessId
        ]
      )
    } else if (type === 'job') {
      result = await pool.query(
        `
          UPDATE public.jobs
          SET
            customer_name = $1,
            service = $2,
            status = $3,
            job_value = $4,
            scheduled_date = $5,
            notes = $6
          WHERE id = $7
            AND business_id = $8
            AND deleted_at IS NULL
          RETURNING id
        `,
        [
          data.name || '',
          data.service || null,
          data.status || 'Scheduled',
          Number(data.value) || 0,
          data.scheduledDate || null,
          data.notes || null,
          id,
          businessId
        ]
      )
    } else if (type === 'customer') {
      result = await pool.query(
        `
          UPDATE public.customers
          SET
            name = $1,
            phone = $2,
            email = $3
          WHERE id = $4
            AND business_id = $5
            AND deleted_at IS NULL
          RETURNING id
        `,
        [
          data.name || '',
          data.phone || null,
          data.email || null,
          id,
          businessId
        ]
      )
    } else {
      return res.status(400).json({
        message: 'Invalid record type.'
      })
    }

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Record was not found.'
      })
    }

    await addActivity({
      businessId,
      userId: req.auth.userId,
      entityType: type,
      entityId: id,
      action: `${type}_updated`
    })

    res.json({
      message: 'Record updated successfully.'
    })
  } catch (error) {
    console.error('Update record error:', error)

    res.status(500).json({
      message: 'Unable to update record.'
    })
  }
})

/* =========================================================
   DELETE RECORDS
   Soft delete so production data can be recovered.
   ========================================================= */

app.delete('/api/records/:type/:id', requireAuth, async (req, res) => {
  try {
    const type = req.params.type
    const id = Number(req.params.id)
    const businessId = req.auth.businessId

    if (!id) {
      return res.status(400).json({
        message: 'Invalid record information.'
      })
    }

    const tableMap = {
      lead: 'leads',
      job: 'jobs',
      customer: 'customers'
    }

    const table = tableMap[type]

    if (!table) {
      return res.status(400).json({
        message: 'Invalid record type.'
      })
    }

    const result = await pool.query(
      `
        UPDATE public.${table}
        SET deleted_at = NOW()
        WHERE id = $1
          AND business_id = $2
          AND deleted_at IS NULL
        RETURNING id
      `,
      [
        id,
        businessId
      ]
    )

    if (result.rowCount === 0) {
      return res.status(404).json({
        message: 'Record was not found.'
      })
    }

    await addActivity({
      businessId,
      userId: req.auth.userId,
      entityType: type,
      entityId: id,
      action: `${type}_deleted`
    })

    res.json({
      message: 'Record deleted successfully.'
    })
  } catch (error) {
    console.error('Delete record error:', error)

    res.status(500).json({
      message: 'Unable to delete record.'
    })
  }
})

/* =========================================================
   DASHBOARD
   ========================================================= */

app.get('/api/dashboard/:businessId', requireAuth, async (req, res) => {
  try {
    const businessId = req.auth.businessId

    const result = await pool.query(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM public.leads
            WHERE business_id = $1
              AND deleted_at IS NULL
              AND status = 'New Lead'
          ) AS "newLeads",

          (
            SELECT COUNT(*)::int
            FROM public.leads
            WHERE business_id = $1
              AND deleted_at IS NULL
              AND status = 'Estimate Sent'
          ) AS "openEstimates",

          (
            SELECT COUNT(*)::int
            FROM public.jobs
            WHERE business_id = $1
              AND deleted_at IS NULL
          ) AS jobs,

          (
            SELECT COALESCE(SUM(estimated_value), 0)::float8
            FROM public.leads
            WHERE business_id = $1
              AND deleted_at IS NULL
              AND status != 'Lost'
          ) AS "potentialValue"
      `,
      [businessId]
    )

    res.json(result.rows[0])
  } catch (error) {
    console.error('Dashboard error:', error)

    res.status(500).json({
      message: 'Unable to load dashboard.'
    })
  }
})

/* =========================================================
   LIST PAGES
   ========================================================= */

app.get('/api/leads/:businessId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          business_id,
          customer_name,
          phone,
          email,
          service,
          status,
          estimated_value::float8 AS estimated_value,
          notes,
          created_at
        FROM public.leads
        WHERE business_id = $1
          AND deleted_at IS NULL
        ORDER BY id DESC
      `,
      [req.auth.businessId]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Leads error:', error)

    res.status(500).json({
      message: 'Unable to load leads.'
    })
  }
})

app.get('/api/jobs/:businessId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          business_id,
          customer_name,
          service,
          status,
          job_value::float8 AS job_value,
          scheduled_date,
          notes,
          created_at
        FROM public.jobs
        WHERE business_id = $1
          AND deleted_at IS NULL
        ORDER BY id DESC
      `,
      [req.auth.businessId]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Jobs error:', error)

    res.status(500).json({
      message: 'Unable to load jobs.'
    })
  }
})

app.get('/api/customers/:businessId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          business_id,
          name,
          phone,
          email,
          notes,
          created_at
        FROM public.customers
        WHERE business_id = $1
          AND deleted_at IS NULL
        ORDER BY id DESC
      `,
      [req.auth.businessId]
    )

    res.json(result.rows)
  } catch (error) {
    console.error('Customers error:', error)

    res.status(500).json({
      message: 'Unable to load customers.'
    })
  }
})


/* =========================================================
   OAUTH CALLBACK
   The actual token exchange is added after the OAuth
   credentials are generated in the marketplace.
   ========================================================= */

app.get('/api/oauth/callback', (req, res) => {
  res
    .status(200)
    .type('html')
    .send(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Townside CRM</title>
        </head>
        <body style="font-family:Arial,sans-serif;padding:40px;">
          <h1>Townside CRM</h1>
          <p>The connection endpoint is online.</p>
        </body>
      </html>
    `)
})

/* =========================================================
   PRODUCTION FRONTEND
   Express serves the compiled React application.
   ========================================================= */

app.use(
  express.static(CLIENT_DIST, {
    index: false
  })
)

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next()
  }

  res.sendFile(
    path.join(CLIENT_DIST, 'index.html'),
    (error) => {
      if (error) {
        next(error)
      }
    }
  )
})

/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use((error, req, res, next) => {
  console.error('Unhandled API error:', error)

  if (res.headersSent) {
    return next(error)
  }

  res.status(500).json({
    message: 'An unexpected server error occurred.'
  })
})

async function startServer() {
  try {
    const connection = await pool.query(`
      SELECT NOW() AS connected_at
    `)

    console.log(
      `PostgreSQL connected at ${connection.rows[0].connected_at.toISOString()}`
    )

    app.listen(PORT, () => {
      console.log(`Townside API running at http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Unable to connect to PostgreSQL.')
    console.error(error)
    process.exit(1)
  }
}

async function shutdown() {
  console.log('\nClosing PostgreSQL connection...')
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

startServer()
