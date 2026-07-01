import { google } from 'googleapis'
import { readFileSync } from 'fs'

const creds = JSON.parse(readFileSync('gmail-credentials.json', 'utf8'))
const { client_id, client_secret } = creds.installed || creds.web
const { refresh_token } = JSON.parse(readFileSync('gmail-token.json', 'utf8'))

const oAuth2 = new google.auth.OAuth2(client_id, client_secret)
oAuth2.setCredentials({ refresh_token })
const gmail = google.gmail({ version: 'v1', auth: oAuth2 })

const FROM_EMAIL = 'waelkens.f@gmail.com'
const subject = 'Sondage de rentrée 2026-2027'
const html = '<html><body><p>Test email avec des accents : rentrée 2026-2027.</p></body></html>'
const to = 'waelkens.f@gmail.com'

function buildRawEmail({ to, subject, html }) {
  const bodyB64 = Buffer.from(html, 'utf8').toString('base64').match(/.{1,76}/g).join('\r\n')
  const message = [
    `From: ${FROM_EMAIL}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].join('\r\n')
  return Buffer.from(message, 'utf8').toString('base64url')
}

const raw = buildRawEmail({ to, subject, html })
console.log('Decoded message:\n', Buffer.from(raw, 'base64url').toString('utf8').slice(0, 500))

try {
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  console.log('SUCCESS:', res.data.id)
} catch (e) {
  console.error('ERROR:', e.message)
  console.error('DETAILS:', JSON.stringify(e.response?.data ?? e.errors, null, 2))
}

// Test avec le vrai template
const BUTTON_STYLE = 'display:inline-block;background:#dc2626;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;font-family:sans-serif;'
const BASE_STYLE   = 'font-family:sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:32px 24px;font-size:15px;line-height:1.7;'
const FOOTER_STYLE = 'margin-top:32px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:13px;color:#666;'
const SIGNATURE = `<div style="${FOOTER_STYLE}"><p><strong>Florent Waelkens</strong><br>Professeur de guitare</p></div>`
const surveyUrl = 'https://hub-guitariste.vercel.app/sondage/test-token-123'

const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body><div style="${BASE_STYLE}">
  <p>Bonjour,</p>
  <p>La rentrée 2026-2027 avance à grands pas&nbsp;! Pour préparer au mieux cette nouvelle année, merci de remplir le formulaire en cliquant sur le lien ci-dessous.</p>
  <p>Il vous permettra de renseigner vos disponibilités et de mettre à jour vos informations.</p>
  <p><strong>Important&nbsp;:</strong> ce sondage ne vaut pas réinscription et ne garantit aucun créneau.</p>
  <p style="margin:28px 0;"><a href="${surveyUrl}" style="${BUTTON_STYLE}">Remplir le sondage →</a></p>
  <p style="font-size:13px;color:#666;">Ce lien est personnel et expire dans 30 jours.</p>
  ${SIGNATURE}
</div></body></html>`

const raw2 = buildRawEmail({ to: 'waelkens.f@gmail.com', subject: 'Sondage de rentrée 2026-2027', html: fullHtml })
try {
  const res2 = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: raw2 } })
  console.log('FULL TEMPLATE SUCCESS:', res2.data.id)
} catch (e) {
  console.error('FULL TEMPLATE ERROR:', e.message)
  console.error('DETAILS:', JSON.stringify(e.response?.data ?? e.errors, null, 2))
}

// Test variante Google-style (HTML inline, pas de CTE)
function buildRawEmailV2({ to, subject, html }) {
  const lines = [
    `From: ${FROM_EMAIL}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ]
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url')
}

const raw3 = buildRawEmailV2({ to: 'waelkens.f@gmail.com', subject: 'Test v2 — rentrée', html: fullHtml })
try {
  const res3 = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: raw3 } })
  console.log('V2 (inline HTML) SUCCESS:', res3.data.id)
} catch (e) {
  console.error('V2 ERROR:', e.message)
  console.error('V2 DETAILS:', JSON.stringify(e.response?.data, null, 2))
}
