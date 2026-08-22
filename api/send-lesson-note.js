import { google } from 'googleapis'

// ─── Config (identique à send-surveys.js) ─────────────────────────────────────

const FROM_EMAIL   = process.env.FROM_EMAIL   || 'waelkens.f@gmail.com'
const TEACHER_NAME = process.env.TEACHER_NAME || 'Florent Waelkens'

const GMAIL_CLIENT_ID     = process.env.GMAIL_CLIENT_ID
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN

// ─── Styles partagés ─────────────────────────────────────────────────────────

const BASE_STYLE   = 'font-family:sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:32px 24px;font-size:15px;line-height:1.7;'
const LABEL_STYLE  = 'font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin-bottom:4px;'
const BLOCK_STYLE  = 'background:#f9f9f9;border-left:3px solid #dc2626;border-radius:4px;padding:12px 16px;margin-bottom:16px;white-space:pre-wrap;'
const FOOTER_STYLE = 'margin-top:32px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:13px;color:#666;'

// ─── Template HTML du compte-rendu ───────────────────────────────────────────

function templateCompteRendu({ studentFirstName, contenuTravaille, contenuAFaire, dateSeance, teacherName }) {
  const nom = studentFirstName ? `, ${studentFirstName}` : ''
  const date = dateSeance
    ? new Date(dateSeance).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  const blocks = []
  if (contenuTravaille) {
    blocks.push(`<p style="${LABEL_STYLE}">Ce que nous avons travaillé</p><p style="${BLOCK_STYLE}">${escHtml(contenuTravaille)}</p>`)
  }
  if (contenuAFaire) {
    blocks.push(`<p style="${LABEL_STYLE}">Pour la semaine prochaine</p><p style="${BLOCK_STYLE}">${escHtml(contenuAFaire)}</p>`)
  }

  return {
    subject: `Compte-rendu de séance${date ? ` — ${date}` : ''}`,
    html: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body><div style="${BASE_STYLE}">
  <p>Bonjour${nom},</p>
  <p>Voici le compte-rendu de notre séance${date ? ` du <strong>${date}</strong>` : ''} :</p>
  ${blocks.join('\n  ')}
  <div style="${FOOTER_STYLE}"><p><strong>${escHtml(teacherName)}</strong><br>Professeur de guitare</p></div>
</div></body></html>`,
  }
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
}

// ─── Email builder (même logique que send-surveys.js) ─────────────────────────

function buildRawEmail({ to, subject, html }) {
  const boundary = `----Part${Date.now()}_${Math.random().toString(36).slice(2)}`
  const message = [
    `From: ${FROM_EMAIL}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html).toString('base64'),
    `--${boundary}--`,
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' })
  }

  const { to, studentFirstName, contenuTravaille, contenuAFaire, dateSeance, customSubject, customHtml } = req.body ?? {}

  if (!to) return res.status(400).json({ error: 'Destinataire manquant.' })
  if (!contenuTravaille && !contenuAFaire && !customHtml) {
    return res.status(400).json({ error: 'Le compte-rendu est vide.' })
  }

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    return res.status(500).json({ error: 'Configuration Gmail manquante (variables d\'environnement).' })
  }

  const oAuth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)
  oAuth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN })
  const gmail = google.gmail({ version: 'v1', auth: oAuth2 })

  const { subject, html } = customHtml
    ? { subject: customSubject || 'Compte-rendu de séance', html: customHtml }
    : templateCompteRendu({ studentFirstName, contenuTravaille, contenuAFaire, dateSeance, teacherName: TEACHER_NAME })

  try {
    const raw = buildRawEmail({ to, subject, html })
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return res.status(200).json({ sent: 1 })
  } catch (err) {
    const detail = err?.response?.data?.error ?? err?.message ?? 'Erreur inconnue'
    return res.status(500).json({ error: String(detail) })
  }
}
