/**
 * gmail-send.mjs
 *
 * Envoie les emails de sondage via Gmail API (OAuth2).
 * Prérequis :
 *   - gmail-credentials.json  (OAuth2 client id/secret depuis Google Cloud Console)
 *   - .env.local               (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
 *
 * Premier lancement : ouvre un URL d'autorisation dans le terminal,
 * collez-le dans un navigateur, puis collez le code retourné.
 * Le token est ensuite sauvegardé dans gmail-token.json pour les lancements suivants.
 *
 * Usage : node gmail-send.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createInterface } from 'readline'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────

const VERCEL_URL    = 'https://le-hub-guitariste.vercel.app'
const FROM_EMAIL    = 'waelkens.f@gmail.com'
const CREDENTIALS_PATH = 'gmail-credentials.json'
const TOKEN_PATH       = 'gmail-token.json'
const SCOPES = ['https://www.googleapis.com/auth/gmail.send']

const DRY_RUN = process.argv.includes('--dry-run')
if (DRY_RUN) console.log('🔍  Mode dry-run — aucun email ne sera envoyé.\n')

// ─── Charger .env.local ───────────────────────────────────────────────────────

function loadEnv(path = '.env.local') {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8').split('\n')
        .filter(l => l.includes('='))
        .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
    )
  } catch { return {} }
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquants dans .env.local')
  process.exit(1)
}

// ─── OAuth2 ───────────────────────────────────────────────────────────────────

function loadCredentials() {
  if (!existsSync(CREDENTIALS_PATH)) {
    console.error(`❌  Fichier ${CREDENTIALS_PATH} introuvable.`)
    console.error('    Téléchargez-le depuis Google Cloud Console → APIs & Services → Credentials.')
    process.exit(1)
  }
  const raw = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'))
  const creds = raw.installed || raw.web
  return creds
}

async function authorize() {
  const { client_id, client_secret, redirect_uris } = loadCredentials()
  const oAuth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'))
    oAuth2.setCredentials(token)
    // Refresh automatique si expiré
    oAuth2.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        const merged = { ...JSON.parse(readFileSync(TOKEN_PATH, 'utf8')), ...tokens }
        writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2))
      }
    })
    return oAuth2
  }

  const authUrl = oAuth2.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES })
  console.log('\n🔐  Autorisation Gmail requise.')
  console.log('    Ouvrez cette URL dans votre navigateur :\n')
  console.log('   ', authUrl)
  console.log()

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const code = await new Promise(resolve => rl.question('Collez le code d\'autorisation ici : ', resolve))
  rl.close()

  const { tokens } = await oAuth2.getToken(code.trim())
  oAuth2.setCredentials(tokens)
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2))
  console.log('\n✅  Token Gmail sauvegardé dans', TOKEN_PATH)
  return oAuth2
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

async function fetchTokens() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const { data: tokens, error } = await supabase
    .from('survey_tokens')
    .select('id, token, email, student_id, used_at, created_at, sent_at')
    .is('used_at', null)
    .gte('created_at', todayStart.toISOString())
    .order('created_at')

  if (error) {
    console.error('❌  Erreur Supabase :', error.message)
    process.exit(1)
  }

  if (!tokens?.length) {
    console.log('ℹ️  Aucun token non utilisé créé aujourd\'hui.')
    process.exit(0)
  }

  // Prénoms des élèves existants
  const studentIds = tokens.map(t => t.student_id).filter(Boolean)
  let studentMap = {}
  if (studentIds.length) {
    const { data: students } = await supabase
      .from('students')
      .select('id, first_name')
      .in('id', studentIds)
    for (const s of students ?? []) studentMap[s.id] = s.first_name
  }

  return { supabase, tokens: tokens.map(t => ({ ...t, firstName: studentMap[t.student_id] ?? null })) }
}

async function markSent(supabase, id) {
  await supabase
    .from('survey_tokens')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', id)
}

// ─── Templates ────────────────────────────────────────────────────────────────

const BUTTON_STYLE = 'display:inline-block;background:#dc2626;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;font-family:sans-serif;'
const BASE_STYLE   = 'font-family:sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:32px 24px;font-size:15px;line-height:1.7;'
const FOOTER_STYLE = 'margin-top:32px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:13px;color:#666;'

function templateReinscription(surveyUrl) {
  return {
    subject: 'Sondage de rentrée 2026-2027',
    html: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body><div style="${BASE_STYLE}">
  <p>Bonjour,</p>
  <p>La rentrée 2026-2027 avance à grands pas&nbsp;! Pour préparer au mieux cette nouvelle année, merci de remplir le formulaire en cliquant sur le lien ci-dessous.</p>
  <p>Il vous permettra de renseigner vos disponibilités et de mettre à jour vos informations.</p>
  <p><strong>Important&nbsp;:</strong> ce sondage ne vaut pas réinscription et ne garantit aucun créneau. Il me sert uniquement à établir un pré-planning. Je reviendrai vers vous pour confirmer votre créneau définitif.</p>
  <p>Merci de cocher un maximum de créneaux possibles — cela m'aidera à trouver la meilleure organisation pour tout le monde.</p>
  <p style="margin:28px 0;"><a href="${surveyUrl}" style="${BUTTON_STYLE}">Remplir le sondage →</a></p>
  <p style="font-size:13px;color:#666;">Ce lien est personnel et expire dans 30 jours. Ne le partagez pas.<br>
  Lien direct&nbsp;: <a href="${surveyUrl}" style="color:#dc2626;">${surveyUrl}</a></p>
  <div style="${FOOTER_STYLE}">
    <p><strong>Florent Waelkens</strong><br>Professeur de guitare</p>
  </div>
</div></body></html>`
  }
}

function templateNouvelEleve(surveyUrl) {
  return {
    subject: 'Bienvenue — Sondage de rentrée 2026-2027',
    html: `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body><div style="${BASE_STYLE}">
  <p>Bonjour,</p>
  <p>Je suis Florent Waelkens, professeur de guitare. Vous vous êtes inscrit dans une des écoles où j'enseigne pour l'année 2026-2027.</p>
  <p>Afin de préparer au mieux cette rentrée, je vous invite à remplir ce formulaire en cliquant sur le lien ci-dessous. Il me permettra de recueillir vos disponibilités et vos informations de contact.</p>
  <p><strong>Important&nbsp;:</strong> ce sondage ne vaut pas inscription et ne garantit aucun créneau. Il me sert uniquement à établir un pré-planning. Je reviendrai vers vous pour confirmer votre créneau définitif.</p>
  <p>Merci de cocher un maximum de créneaux possibles — cela m'aidera à trouver la meilleure organisation pour tout le monde.</p>
  <p style="margin:28px 0;"><a href="${surveyUrl}" style="${BUTTON_STYLE}">Remplir le sondage →</a></p>
  <p style="font-size:13px;color:#666;">Ce lien est personnel et expire dans 30 jours. Ne le partagez pas.<br>
  Lien direct&nbsp;: <a href="${surveyUrl}" style="color:#dc2626;">${surveyUrl}</a></p>
  <div style="${FOOTER_STYLE}">
    <p><strong>Florent Waelkens</strong><br>Professeur de guitare</p>
  </div>
</div></body></html>`
  }
}

// ─── Envoi Gmail ──────────────────────────────────────────────────────────────

function buildRawEmail({ to, from, subject, html }) {
  const boundary = `----Part${Date.now()}_${Math.random().toString(36).slice(2)}`
  const message = [
    `From: ${from}`,
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

async function sendEmail(gmail, { to, from, subject, html }) {
  const raw = buildRawEmail({ to, from, subject, html })
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const auth = await authorize()
  const gmail = google.gmail({ version: 'v1', auth })

  const { supabase, tokens } = await fetchTokens()

  console.log(`\n📬  ${tokens.length} email(s) à envoyer :\n`)

  let sent = 0
  let failed = 0

  for (const t of tokens) {
    if (!t.email) {
      console.log(`  ⚠️  Token ${t.id} sans email — ignoré.`)
      continue
    }

    const surveyUrl = `${VERCEL_URL}/sondage/${t.token}`
    const { subject, html } = t.student_id
      ? templateReinscription(surveyUrl)
      : templateNouvelEleve(surveyUrl)

    const label = t.firstName ? `${t.firstName} <${t.email}>` : t.email

    if (DRY_RUN) {
      console.log(`  ✓  [DRY-RUN] ${label}  →  "${subject}"`)
      console.log(`     ${surveyUrl}`)
      continue
    }

    try {
      await sendEmail(gmail, { to: t.email, from: FROM_EMAIL, subject, html })
      await markSent(supabase, t.id)
      console.log(`  ✓  Envoyé : ${label}`)
      sent++
    } catch (e) {
      console.error(`  ✗  Échec : ${label} — ${e.message}`)
      failed++
    }
  }

  console.log()
  if (!DRY_RUN) {
    console.log(`Résultat : ${sent} envoyé(s), ${failed} échec(s).`)
  }
}

main()
