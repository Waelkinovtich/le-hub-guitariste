import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const token = JSON.parse(readFileSync('gmail-token.json', 'utf8'))
const creds = (() => { const c = JSON.parse(readFileSync('gmail-credentials.json','utf8')); return c.installed||c.web })()

process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key'
process.env.GMAIL_CLIENT_ID = creds.client_id
process.env.GMAIL_CLIENT_SECRET = creds.client_secret
process.env.GMAIL_REFRESH_TOKEN = token.refresh_token

const { default: handler } = await import('./api/send-surveys.js')

const req = {
  method: 'POST',
  body: {
    tokens: [{
      tokenId: 'test-local-id',
      email: 'waelkens.f@gmail.com',
      studentId: null,
      token: 'aaaaaaaa-test-bbbb-cccc-dddddddddddd'
    }]
  }
}

const res = {
  _status: 200,
  status(code) { this._status = code; return this },
  json(body) { console.log('STATUS:', this._status); console.log('BODY:', JSON.stringify(body, null, 2)); return this }
}

await handler(req, res)
