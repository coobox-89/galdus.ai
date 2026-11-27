import React from 'react';
import { href } from './paths';
import { Mark, Wordmark } from './brand';

// Operator details come from the build environment, so each installation shows its own:
// VITE_LEGAL_OPERATOR, VITE_LEGAL_ADDRESS, VITE_LEGAL_EMAIL, VITE_LEGAL_COUNTRY.
const env = import.meta.env;
export const LEGAL = {
  operator: env.VITE_LEGAL_OPERATOR || 'Mario Cubello',
  address: env.VITE_LEGAL_ADDRESS || '',
  email: env.VITE_LEGAL_EMAIL || '',
  country: env.VITE_LEGAL_COUNTRY || 'Italy',
  updated: '27 November 2026',
  version: '1.0',
};
const REPO = 'https://github.com/coobox-89/galdus.ai';

function Contact() {
  return LEGAL.email
    ? <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
    : <>the contact form on our <a href={`${REPO}/issues/new/choose`}>GitHub project</a> (use a private security advisory for anything sensitive)</>;
}
function Operator() {
  return <><b>{LEGAL.operator}</b>{LEGAL.address ? `, ${LEGAL.address}` : ''}, {LEGAL.country}</>;
}

function Page({ title, intro, children }) {
  return (
    <article className="legal">
      <a href={href('/')} className="legal-brand"><Mark size={28} /><Wordmark /></a>
      <p className="muted small">Version {LEGAL.version}, effective {LEGAL.updated}</p>
      <h1>{title}</h1>
      {intro && <p className="legal-intro">{intro}</p>}
      <nav className="legal-nav" aria-label="Legal documents">
        <a href={href('/privacy')}>Privacy</a><a href={href('/terms')}>Terms</a><a href={href('/acceptable-use')}>Acceptable use</a>
      </nav>
      {children}
      <p className="legal-back"><a href={href('/')}>Back to Galdus.ai</a></p>
    </article>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy policy" intro="How Galdus.ai handles personal data, in plain words. It applies to the hosted service at this address and follows the EU General Data Protection Regulation (GDPR).">
      <h2>1. Who is responsible</h2>
      <p>The data controller for accounts and for the operation of the service is <Operator />. You can reach us through <Contact />.</p>
      <p>When an organisation uses a workspace, the organisation decides what content goes into it (documents, chats, automations). For that content the organisation is the controller and Galdus.ai acts as its processor. Organisations can ask us for a data processing agreement.</p>

      <h2>2. What we collect</h2>
      <ul>
        <li><b>Account:</b> name, email address, password hash (Argon2, we never see your password), optional profile photo, whether your email is verified, and, if you turn it on, your encrypted two-step verification secret and the hashes of your recovery codes.</li>
        <li><b>Sign-in with Google or GitHub:</b> the account identifier, name and verified email the provider shares with us. We do not receive your password.</li>
        <li><b>Workspace content:</b> chats and their attachments, knowledge documents and files imported from Google Drive, SharePoint or OneDrive, agents, automations and their runs, and your chat preferences.</li>
        <li><b>Connections:</b> API keys of model providers, tokens for cloud drives and MCP servers. They are encrypted at rest and never shown again after you save them.</li>
        <li><b>Usage and security records:</b> model, token counts and time of each request, an audit log of administrative actions, and IP addresses processed briefly for rate limiting and abuse prevention.</li>
      </ul>
      <p>We do not use your content to train AI models, we do not sell data and we do not run advertising or third-party analytics.</p>

      <h2>3. Why, and on what legal basis</h2>
      <ul>
        <li>To create your account and provide the service you asked for (contract, art. 6(1)(b) GDPR).</li>
        <li>To keep the service secure, prevent abuse and keep audit records (legitimate interest, art. 6(1)(f)).</li>
        <li>To send service emails such as email confirmation, password reset and invitations (contract and legitimate interest). We do not send marketing.</li>
        <li>To meet legal obligations, when they apply (art. 6(1)(c)).</li>
      </ul>

      <h2>4. AI model providers</h2>
      <p>Galdus.ai does not supply its own models. When you chat or run an agent, the text you send, relevant passages from your knowledge and the tool results are sent to the model provider your workspace connected (for example OpenAI, Anthropic, Google, Mistral, DeepSeek, OpenRouter, or a server you run yourself), using that workspace's own key. The provider processes it under the terms the workspace accepted with it. Choose providers and settings that fit your data.</p>

      <h2>5. Who else processes data</h2>
      <ul>
        <li>Supabase: database hosting, European Union (Frankfurt).</li>
        <li>Render: API hosting, European Union (Frankfurt).</li>
        <li>GitHub (Microsoft): hosting of the web console and of the scheduler that runs automations; may process IP addresses in the United States.</li>
        <li>The email provider configured for this installation, only to deliver service emails.</li>
        <li>Google, GitHub and Microsoft, only if you choose to sign in or connect a drive with them.</li>
      </ul>
      <p>Where data leaves the European Economic Area, transfers rely on the EU-US Data Privacy Framework or on the European Commission's Standard Contractual Clauses.</p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Account data, workspace content and connections: while your account or the workspace exists. You can delete chats, documents, agents and connections at any time.</li>
        <li>When you delete your account, your personal data is erased within 30 days, including from rolling backups kept by our hosting providers.</li>
        <li>Usage and audit records are kept for up to 24 months for security and accounting, then deleted or anonymised.</li>
        <li>Email confirmation and password reset links expire after 48 hours and 1 hour; sign-in rate-limit counters after a few minutes.</li>
      </ul>

      <h2>7. Security</h2>
      <p>Encryption in transit (HTTPS) and of secrets at rest, row-level security in the database, isolation between workspaces, role-based access, optional two-step verification, session revocation and rate limiting. The source code is public, so anyone can check how it works.</p>

      <h2>8. Your rights</h2>
      <p>You can access, correct, export and delete your data. From your account you can download your data and delete your account at any time. You can also ask for restriction, object to processing based on legitimate interest, and ask for portability, by writing to <Contact />. We answer within one month. You have the right to lodge a complaint with a supervisory authority: in Italy, the Garante per la protezione dei dati personali (garanteprivacy.it).</p>

      <h2>9. Cookies and local storage</h2>
      <p>We use no tracking or advertising cookies. The console keeps your session in the browser tab (session storage) and remembers the last workspace you opened (local storage). Sign-in with Google or GitHub sets one short-lived, strictly necessary cookie (10 minutes) to protect the sign-in. Fonts are served by Galdus.ai itself.</p>

      <h2>10. Age</h2>
      <p>The hosted service is for people aged 18 or over.</p>

      <h2>11. Changes</h2>
      <p>If we change this policy in a meaningful way we will tell account holders by email or in the console before the change applies. The version and date are shown at the top.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of service" intro="The agreement between you and the operator of this Galdus.ai service. Please read it: by creating an account you accept it.">
      <h2>1. The service</h2>
      <p>Galdus.ai is an AI workspace operated by <Operator /> (“we”). It lets you chat with AI models, build knowledge collections, agents and automations, and connect your tools. During early access the hosted service is free of charge. The software is open source under the GNU AGPL-3.0; these terms cover the hosted service only, not your own installations.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 and give accurate information. If you use Galdus.ai for an organisation, you confirm you may bind it to these terms.</li>
        <li>Keep your credentials safe and turn on two-step verification. You are responsible for what happens under your account.</li>
        <li>Workspace owners decide who joins, with which role, and which providers and tools the workspace uses.</li>
      </ul>

      <h2>3. Your content and your keys</h2>
      <ul>
        <li>You keep all rights to the content you put in Galdus.ai and to the output you receive. You give us only the permission needed to store, process and transmit it to provide the service.</li>
        <li>You confirm you have the right to upload the content and, for personal data of others, a lawful basis to process it.</li>
        <li>Model providers, drives and MCP servers are connected with your own keys and accounts. Their terms, prices and usage policies apply to you; costs they charge are yours.</li>
      </ul>

      <h2>4. AI output</h2>
      <p>Answers are generated by third-party models and can be wrong, incomplete or outdated. Check them before relying on them, especially for legal, medical, financial, security or other important decisions. Agents and automations act only with the tools you allow; review what you enable.</p>

      <h2>5. Acceptable use</h2>
      <p>You agree to follow the <a href={href('/acceptable-use')}>acceptable use policy</a>. We may suspend access that breaks it, puts others at risk or threatens the service, and will tell you why unless the law prevents it.</p>

      <h2>6. Availability and changes</h2>
      <p>The service is provided “as is” during early access, without a service level. Usage limits apply. We may change features, introduce paid plans with notice, or end the service; if we end it we will give at least 30 days' notice so you can export your data.</p>

      <h2>7. Ending the agreement</h2>
      <p>You can stop using Galdus.ai and delete your account at any time from your account page. We may close accounts that seriously or repeatedly break these terms.</p>

      <h2>8. Liability</h2>
      <p>To the extent the law allows, we are not liable for indirect or consequential losses, lost profits or lost data, nor for the output of third-party models or the actions of services you connect. Nothing in these terms limits liability for intent or gross negligence (art. 1229 of the Italian Civil Code), for death or personal injury, or your rights as a consumer under mandatory law.</p>

      <h2>9. Law and disputes</h2>
      <p>These terms are governed by Italian law. If you are a consumer, you may bring proceedings in the courts of your place of residence and you keep the protection of the mandatory rules of your country. Otherwise, the courts of Milan, Italy have jurisdiction.</p>

      <h2>10. Trademarks</h2>
      <p id="trademarks">OpenAI, Claude, Anthropic, Gemini, Mistral, DeepSeek, OpenRouter, Groq, Together AI, Fireworks AI, xAI, Ollama and all other product names, logos and brands mentioned in Galdus.ai are the property of their respective owners. Galdus.ai is an independent, open-source project. It is not affiliated with, sponsored by, endorsed by or otherwise connected to any of them. Third-party names and logos are used for identification purposes only, to indicate compatibility with their services.</p>

      <h2>11. Contact</h2>
      <p>Questions about these terms: <Contact />.</p>
    </Page>
  );
}

export function AcceptableUse() {
  return (
    <Page title="Acceptable use policy" intro="What you may not do with Galdus.ai. It applies to every workspace on the hosted service.">
      <h2>Do not use Galdus.ai to</h2>
      <ul>
        <li>break the law, or infringe privacy, intellectual property or other rights;</li>
        <li>create or share content that sexualises minors, promotes terrorism or violence, harasses people or incites hatred;</li>
        <li>get help with weapons capable of mass harm, or with malware and attacks on systems you are not authorised to test;</li>
        <li>deceive people: impersonation, fraud, phishing, fake reviews, or AI content passed off as human where that misleads;</li>
        <li>process special categories of personal data (health, biometrics and similar) without a lawful basis and suitable safeguards;</li>
        <li>make decisions with legal or similarly significant effects on people based solely on AI output, without human review;</li>
        <li>access other workspaces, probe for vulnerabilities outside our disclosure process, bypass limits or overload the service;</li>
        <li>break the usage policies of the model providers you connect.</li>
      </ul>
      <h2>Report a problem</h2>
      <p>Report abuse through <Contact />. Report security vulnerabilities privately through the repository's <a href={`${REPO}/security/advisories/new`}>security advisories</a>. We review every report.</p>
    </Page>
  );
}
