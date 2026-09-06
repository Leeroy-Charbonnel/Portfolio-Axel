import { Resend } from "resend"
import { isLang, LANG_COOKIE, LANG_DEFAULT, type Lang } from "../src/lib/lang"

//TRANSACTIONAL MAIL: one shell, one function per letter, each written in the two
//languages the app speaks. CLAUDE.md rule 3 (every value through a CSS variable)
//does not reach this file: mail clients drop <style> blocks and know nothing of
//custom properties, so the shell inlines every declaration and writes its
//colours literally. The copy is written here rather than read from the
//translations table, which the browser loads to paint the screen: wiring it in
//would cost a query per letter for a handful of strings.

//ENVIRONMENT - no default here: a letter signed "App" and pointing at localhost is
//worse than a refusal to boot. env.ts names these at start for server.ts; this
//repeats the check for anything that imports this file on its own. A throw at
//module level narrows nothing inside the functions below, and a template string
//swallows an undefined without a word, so the check hands back a string
function required(name: string, why: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`[email] ${name} is missing: ${why}`)
  return value
}

const appName      = required("APP_NAME", "every letter is signed with it")
const publicAppUrl = required("PUBLIC_APP_URL", "every letter carries a link, and a link needs an origin")
const emailFrom    = required("EMAIL_FROM", "the sender every letter goes out under")
const resendApiKey = process.env.RESEND_API_KEY

//the sandbox sender delivers to the Resend account owner's own inbox and to nobody
//else: every other address silently receives nothing. A domain verified in Resend
//is the only sender that reaches a user
if (emailFrom.endsWith("@resend.dev")) {
  throw new Error(
    `[email] EMAIL_FROM is the Resend sandbox sender (${emailFrom}): it only delivers to the account owner. ` +
    "Verify a domain in Resend and use an address on it.",
  )
}

if (!resendApiKey) {
  console.warn(
    "[email] RESEND_API_KEY is missing. Verification, reset and sign-in links are logged to this console " +
    "instead of being emailed. Set RESEND_API_KEY before going to production.",
  )
}

let resend: Resend | null = null

export type Message = {
  lang:    Lang
  subject: string
  title:   string
  //paragraphs above the button
  lead:    string[]
  action:  { url: string; label: string }
  //small print between the link and the footer
  notes:   string[]
  //an irreversible statement: the logo dot and the title turn red
  danger?: true
}

//paste is an eyebrow label above the link, not a sentence: no closing colon
const SHELL = {
  fr: {
    paste:  "Ou collez ce lien dans votre navigateur",
    reason: `Vous recevez ce message parce que cette adresse a été utilisée sur ${appName}. Nous n'envoyons que les messages nécessaires à un compte : confirmation d'adresse, connexion, mot de passe et suppression du compte.`,
  },
  en: {
    paste:  "Or paste this link into your browser",
    reason: `You are receiving this message because this address was used on ${appName}. We only send what an account needs: address confirmation, sign-in, password and account deletion.`,
  },
}

//THE LANGUAGE OF A LETTER is the cookie useLang keeps, which rides along with the
//auth call that triggers the send. settings.language is written by the browser
//and does not exist yet when the very first letter, the verification one, goes
//out; the cookie is the one thing that exists that early. Nothing said means
//French, the app's own default. It is the reader's own cookie for every letter
//but existingAccountMessage: that one goes to the address's owner while the
//cookie belongs to whoever typed the address into the sign-up form. Cosmetic
//only: both wordings say the same thing, and the letter carries nothing the
//sender did not already type
export function mailLang(headers: Headers | undefined): Lang {
  const held = headers?.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=([^;]*)`))?.[1]
  if (isLang(held)) return held
  //an empty cookie is nothing said, like no cookie at all: only a value nothing writes is named
  if (held) console.warn(`[email] unknown language cookie "${held}", sending in French`)
  return LANG_DEFAULT
}

//the app's light palette, written literally: --background, --card, --foreground,
//--muted-foreground, --border and --primary. One fixed palette and no colour media
//query, so the shell looks the same everywhere; Gmail's forced inversion still
//reads, because every text declares its colour on the same cell as its background
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

//DANGER - --destructive in the light theme, written literally like the rest. Only
//the two deletion letters carry it, and only on the logo dot and the title: a red
//that also painted a reset link would stop meaning anything. The button stays in
//the accent in those letters, because what it does is bring the account back
const PRIMARY     = "#007595"
const DESTRUCTIVE = "#c11f1f"

function html(message: Message) {
  const shell = SHELL[message.lang]
  const ink   = message.danger ? DESTRUCTIVE : PRIMARY
  //the address of a login page under a button that says "sign in" tells the reader nothing
  const paste = message.action.url !== `${publicAppUrl}/login`
  const cell = `bgcolor="#ffffff" style="background-color:#ffffff;`
  return `<!DOCTYPE html>
<html lang="${message.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${message.subject}</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  @media (max-width:520px) { .pad { padding-left:22px !important; padding-right:22px !important; } }
</style>
</head>
<body bgcolor="#f2f2f2" style="margin:0;padding:0;background-color:#f2f2f2;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${message.lead.join(" ")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f2" style="background-color:#f2f2f2;">
<tr><td align="center" style="padding:40px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:520px;background-color:#ffffff;border:1px solid #d6d6d6;border-radius:4px;">
  <tr><td class="pad" ${cell}padding:30px 30px 0;">
    <div style="font-family:${FONT};font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#0a0a0a;">${appName}<span style="color:${ink};">.</span></div>
  </td></tr>
  <tr><td class="pad" ${cell}padding:26px 30px 0;">
    <h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.28;font-weight:700;letter-spacing:-0.015em;color:${message.danger ? DESTRUCTIVE : "#0a0a0a"};">${message.title}</h1>
    ${message.lead.map(p => `<p style="margin:16px 0 0;font-family:${FONT};font-size:15px;line-height:1.65;color:#0a0a0a;">${p}</p>`).join("\n    ")}
  </td></tr>
  <tr><td class="pad" ${cell}padding:28px 30px 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="${PRIMARY}" style="background-color:${PRIMARY};border-radius:4px;">
        <a href="${message.action.url}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${message.action.label}</a>
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="pad" ${cell}padding:26px 30px 0;">
    ${paste ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td bgcolor="#f2f2f2" style="background-color:#f2f2f2;border-radius:4px;padding:14px 16px;">
        <p style="margin:0 0 6px;font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#666666;">${shell.paste}</p>
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.55;word-break:break-all;"><a href="${message.action.url}" style="color:${PRIMARY};">${message.action.url}</a></p>
      </td>
    </tr></table>` : ""}
    ${message.notes.map((n, i) => `<p style="margin:${!paste && i === 0 ? "0" : "18px"} 0 0;font-family:${FONT};font-size:13px;line-height:1.55;word-break:break-word;color:#666666;">${n}</p>`).join("\n    ")}
  </td></tr>
  <tr><td class="pad" ${cell}padding:26px 30px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #d6d6d6;font-size:0;line-height:0;padding-bottom:16px;">&nbsp;</td></tr></table>
    <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.55;color:#666666;">${shell.reason}</p>
    <p style="margin:0;font-family:${FONT};font-size:12px;color:#666666;">${appName} &middot; <a href="${publicAppUrl}" style="color:${PRIMARY};text-decoration:none;">${publicAppUrl}</a></p>
  </td></tr>
</table>

</td></tr>
</table>
</body>
</html>`
}

function text(message: Message) {
  return [
    appName,
    "",
    message.title,
    "",
    ...message.lead,
    "",
    //the space before the colon is French typography, and English does not take it
    `${message.action.label}${message.lang === "fr" ? " : " : ": "}${message.action.url}`,
    ...(message.notes.length ? ["", ...message.notes] : []),
    "",
    "--",
    SHELL[message.lang].reason,
    `${appName} - ${publicAppUrl}`,
  ].join("\n")
}

//exported for the render check in scripts and for a project that swaps the transport
export const render = { html, text }

//with no transport the link still has to reach the developer, or a fresh account is trapped on /verify-email
export async function sendMail(to: string, message: Message) {
  if (!resendApiKey) {
    console.warn(`[email] no transport - "${message.subject}" for ${to} was NOT sent. Link:
${message.action.url}`)
    return
  }
  if (!resend) resend = new Resend(resendApiKey)
  //text alongside html, not instead of it: a body with no plain part is a spam signal at Gmail
  const { error } = await resend.emails.send({
    from:    emailFrom,
    to,
    subject: message.subject,
    html:    html(message),
    text:    text(message),
  })
  if (error) throw new Error(`email send failed: ${error.message}`)
}

export function verifyEmailMessage(link: string, lang: Lang): Message {
  return lang === "en" ? {
    lang,
    subject: "Confirm your email address",
    title:   "Confirm your email address",
    lead:    ["One step left to activate your account: confirm that this address is yours."],
    action:  { url: link, label: "Confirm my address" },
    notes:   ["If you did not create an account, ignore this message: no account will be activated."],
  } : {
    lang,
    subject: "Confirmez votre adresse e-mail",
    title:   "Confirmez votre adresse e-mail",
    lead:    ["Il ne reste qu'une étape pour activer votre compte : confirmez que cette adresse est bien la vôtre."],
    action:  { url: link, label: "Confirmer mon adresse" },
    notes:   ["Si vous n'avez pas créé de compte, ignorez ce message : aucun compte ne sera activé."],
  }
}

export function resetPasswordMessage(link: string, lang: Lang): Message {
  return lang === "en" ? {
    lang,
    subject: "Reset your password",
    title:   "Reset your password",
    lead:    ["You asked for a new password. The link below expires in one hour."],
    action:  { url: link, label: "Choose a new password" },
    notes:   ["If you did not ask for this, ignore this message: your current password still works."],
  } : {
    lang,
    subject: "Réinitialisez votre mot de passe",
    title:   "Réinitialisez votre mot de passe",
    lead:    ["Vous avez demandé un nouveau mot de passe. Le lien ci-dessous expire dans une heure."],
    action:  { url: link, label: "Choisir un nouveau mot de passe" },
    notes:   ["Si vous n'avez rien demandé, ignorez ce message : votre mot de passe actuel reste valable."],
  }
}

export function signInLinkMessage(link: string, lang: Lang, minutes: number): Message {
  return lang === "en" ? {
    lang,
    subject: "Your sign-in link",
    title:   "Your sign-in link",
    lead:    [`Here is your sign-in link. It expires in ${minutes} minutes and works only once.`],
    action:  { url: link, label: "Sign in" },
    notes:   ["If you did not ask for this, ignore this message: nobody can sign in without this link."],
  } : {
    lang,
    subject: "Votre lien de connexion",
    title:   "Votre lien de connexion",
    lead:    [`Voici votre lien de connexion. Il expire dans ${minutes} minutes et ne fonctionne qu'une fois.`],
    action:  { url: link, label: "Me connecter" },
    notes:   ["Si vous n'avez rien demandé, ignorez ce message : personne ne peut se connecter sans ce lien."],
  }
}

export function existingAccountMessage(lang: Lang): Message {
  return lang === "en" ? {
    lang,
    subject: "Someone tried to create an account with your address",
    title:   "Someone tried to create an account with your address",
    lead:    [`A ${appName} account already exists for this address: nothing was created and nothing changed.`],
    action:  { url: `${publicAppUrl}/login`, label: "Sign in" },
    notes:   [
      `Forgot your password? Ask for a new one here: ${publicAppUrl}/forgot-password`,
      "If this was you, there is nothing to do.",
    ],
  } : {
    lang,
    subject: "Quelqu'un a tenté de créer un compte avec votre adresse",
    title:   "Quelqu'un a tenté de créer un compte avec votre adresse",
    lead:    [`Un compte ${appName} existe déjà pour cette adresse : rien n'a été créé et rien n'a changé.`],
    action:  { url: `${publicAppUrl}/login`, label: "Me connecter" },
    notes:   [
      `Mot de passe oublié ? Demandez-en un nouveau ici : ${publicAppUrl}/forgot-password`,
      "Si c'était vous, il n'y a rien à faire.",
    ],
  }
}

//DELETION - for a project that keeps a deleted account for a while before erasing
//it. Both letters are statements and not requests, but signing in is exactly how
//the account comes back, so the button says that instead of pointing at nothing
export function accountDeletedMessage(lang: Lang, graceDays: number): Message {
  return lang === "en" ? {
    lang,
    subject: "Your account has been deleted",
    title:   "Your account has been deleted",
    lead:    [
      "Your account has left the app and your sessions are closed.",
      `It is kept for ${graceDays} days. To come back, just sign in again: everything is there as you left it.`,
      `After those ${graceDays} days it is erased for good, and nothing can bring it back.`,
    ],
    action:  { url: `${publicAppUrl}/login`, label: "Sign in again" },
    notes:   ["If you did not ask for this deletion, sign in now: that alone restores your account."],
    danger:  true,
  } : {
    lang,
    subject: "Votre compte est supprimé",
    title:   "Votre compte est supprimé",
    lead:    [
      "Votre compte quitte l'application immédiatement et vos sessions sont fermées.",
      `Il est conservé ${graceDays} jours. Pour revenir, il suffit de vous reconnecter : tout est là tel que vous l'avez laissé.`,
      `Passé ces ${graceDays} jours, il est effacé pour de bon et plus rien ne peut le ramener.`,
    ],
    action:  { url: `${publicAppUrl}/login`, label: "Me reconnecter" },
    notes:   ["Si vous n'avez pas demandé cette suppression, reconnectez-vous maintenant : cela suffit à rétablir votre compte."],
    danger:  true,
  }
}

export function accountPurgeSoonMessage(lang: Lang, days: number): Message {
  return lang === "en" ? {
    lang,
    subject: `Your account will be deleted for good in ${days} days`,
    title:   `Your account will be deleted for good in ${days} days`,
    lead:    [
      `You deleted your account, and the time it is kept is almost over. In ${days} days it is erased for good, with everything in it. That cannot be undone.`,
      "While there is still time, signing in again brings everything back as you left it.",
    ],
    action:  { url: `${publicAppUrl}/login`, label: "Sign in again" },
    notes:   ["If you meant to leave, there is nothing to do: the deletion happens on its own."],
    danger:  true,
  } : {
    lang,
    subject: `Votre compte sera définitivement supprimé dans ${days} jours`,
    title:   `Votre compte sera définitivement supprimé dans ${days} jours`,
    lead:    [
      `Vous avez supprimé votre compte et son délai de conservation touche à sa fin. Dans ${days} jours, il est effacé pour de bon, avec tout ce qu'il contient. C'est définitif.`,
      "Tant qu'il est temps, il suffit de vous reconnecter pour tout retrouver tel que vous l'avez laissé.",
    ],
    action:  { url: `${publicAppUrl}/login`, label: "Me reconnecter" },
    notes:   ["Si vous vouliez bien partir, il n'y a rien à faire : la suppression se fera toute seule."],
    danger:  true,
  }
}
