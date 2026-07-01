import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────

const VERCEL_URL = 'https://hub-guitariste.vercel.app'
const FROM_EMAIL = 'waelkens.f@gmail.com'

// ─── Supabase (service role pour bypasser RLS sur update) ────────────────────

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquants.')
  return createClient(url, key)
}

// ─── OAuth2 ───────────────────────────────────────────────────────────────────

function getGmailClient() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN } = process.env
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error('Variables Gmail manquantes : GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN.')
  }
  const oAuth2 = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET)
  oAuth2.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth: oAuth2 })
}

// ─── Templates ────────────────────────────────────────────────────────────────

const BUTTON_STYLE = 'display:inline-block;background:#dc2626;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;font-family:sans-serif;'
const BASE_STYLE   = 'font-family:sans-serif;color:#1a1a1a;max-width:580px;margin:0 auto;padding:32px 24px;font-size:15px;line-height:1.7;'
const FOOTER_STYLE = 'margin-top:32px;padding-top:20px;border-top:1px solid #e5e5e5;font-size:13px;color:#666;'

const SIGNATURE = `<div style="${FOOTER_STYLE}"><p><strong>Florent Waelkens</strong><br>Professeur de guitare</p></div>`

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
  ${SIGNATURE}
</div></body></html>`,
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
  ${SIGNATURE}
</div></body></html>`,
  }
}

// ─── Email builder ────────────────────────────────────────────────────────────

function buildRawEmail({ to, subject, html }) {
  // Approche Google-style : HTML inline dans le body, enveloppe encodée en base64url
  const message = [
    `From: ${FROM_EMAIL}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
  ].join('\r\n')

  return Buffer.from(message, 'utf8').toString('base64url')
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tokens } = req.body ?? {}
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return res.status(400).json({ error: 'tokens[] requis dans le body.' })
  }

  let gmail, supabase
  try {
    gmail = getGmailClient()
    supabase = getSupabase()
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }

  const errors = []
  let sent = 0

  for (const { tokenId, email, studentId, token } of tokens) {
    if (!email || !tokenId) {
      errors.push({ tokenId, error: 'email ou tokenId manquant' })
      continue
    }

    const surveyUrl = `${VERCEL_URL}/sondage/${token}`
    const { subject, html } = studentId
      ? templateReinscription(surveyUrl)
      : templateNouvelEleve(surveyUrl)

    try {
      const raw = buildRawEmail({ to: email, subject, html })
      await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

      await supabase
        .from('survey_tokens')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', tokenId)

      sent++
    } catch (e) {
      const detail = e.response?.data?.error?.message ?? e.response?.data ?? e.message
      errors.push({ tokenId, email, error: typeof detail === 'string' ? detail : JSON.stringify(detail) })
    }
  }

  return res.status(200).json({ sent, errors })
}
