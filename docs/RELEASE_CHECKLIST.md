# Release checklist: Galdus.ai 1.0.0-rc.1

Revisione per la produzione del 27 novembre 2026, branch `release/production-readiness`.

## 1. Verdetto

**Non ancora pronto** per l'apertura pubblica, ma solo per passi di configurazione che richiedono i tuoi account: il codice è pronto.

- Codice, test e documentazione: pronti. 141 test API, 18 test end-to-end, `pip-audit` e `npm audit` senza vulnerabilità, nessun segreto nella cronologia (gitleaks), nessuna violazione di accessibilità (axe, WCAG 2 AA) e console del browser pulita su tutte le pagine a 360, 768 e 1440 px.
- Bloccanti prima di invitare persone: ruotare la password del database e la password admin temporanea, impostare `LEGAL_EMAIL` (le pagine legali non hanno ancora un contatto), verificare `/readyz` dopo il deploy accettare gli accordi sul trattamento dei dati (DPA) con i fornitori citati nella privacy policy e collegare almeno un modello (senza, la chat non risponde). Sono i passi 1-7 qui sotto; dopo questi il verdetto diventa "Pronto per la produzione" per l'anteprima a costo zero.
- SMTP e OAuth non bloccano: senza di essi la registrazione funziona, ma non ci sono email (verifica, reset password, inviti via mail) né accesso con Google, GitHub o Microsoft.

## 2. Cosa ho fatto

### Fase 1. Sicurezza
Dettagli, esiti e rischi residui in [security/review-2026-11-27.md](security/review-2026-11-27.md).
- Blocco per account dopo 5 password o 10 codici MFA errati in 15 minuti, indipendente dall'IP.
- `ADMIN_EMAILS` dà la console admin solo a un indirizzo confermato (prima chiunque registrasse quell'email per primo diventava admin).
- Connessione di Google Drive e SharePoint completata dalla sessione che l'ha avviata (prima un link di consenso poteva collegare il drive di una vittima al workspace di un altro).
- Accesso con Microsoft, senza collegamento ad account esistenti per email; il reset password rimuove gli accessi collegati prima della verifica.
- Registrazione che non rivela gli account esistenti (con verifica email obbligatoria e SMTP).
- Webhook: errori 400/422 invece di 500, limite per automazione. Reset password: 3 email per indirizzo all'ora, un link usato annulla gli altri. Upload controllati per contenuto.
- CSP su API e console, log JSON senza token né query string, errori uniformi con `request_id`, parametri SQL nascosti.
- Avvio in produzione bloccato con `ENCRYPTION_KEY` mancante, segreti di esempio o URL non https.
- Cancellazione account per chi non ha password e senza lasciare team senza proprietario; export GDPR completo (chat, esecuzioni, accessi collegati).
- Test che fallisce se una tabella non ha RLS; dipendenze fissate (`requirements.lock`), licenze verificate (tutte compatibili con AGPL-3.0), gitleaks e audit bloccanti in CI.

### Fase 2. Pulizia e correttezza
- Rimossi codice e file non usati (vecchio CSS della landing, componente `Swoosh`, `initialsOf`, un file `.whl` dimenticato, configurazione Netlify), dopo aver verificato che nulla li richiamava.
- Inglese americano uniforme nell'interfaccia; testi legali invariati.
- Accessibilità: titolo nella pagina Chat, ruoli ARIA corretti in Apps, etichetta sull'input della foto, contrasto del testo piccolo portato a 5,1:1, pagina Team senza scorrimento orizzontale su telefono e tablet.
- Documentazione allineata al codice (variabili, endpoint, versioni, comandi).

### Fase 3. Verifica funzionale
- E2E nuovi: tutte le pagine da utente e da admin a 360/768/1440 px con console pulita, pagine legali, Apps, invito accettato da una seconda persona, export e cancellazione account, console admin e guide di setup.
- Già coperti e verdi: registrazione, wizard modelli, chat in streaming, knowledge, agenti, automazioni con "Run now", MFA.
- Non coperti in E2E perché richiedono servizi esterni: login OAuth reale, email reali, import web pubblico, MCP reale, drive. Sono coperti dai test API con provider simulati.

### Fase 4. Tutorial al primo accesso
- Tour di 7 passi (Home, modello, chat, knowledge, agenti, automazioni, account e sicurezza), saltabile, con evidenziazione, Avanti/Indietro/Salta, tastiera, focus trap, `Esc`, animazioni ridotte, versione a pannello in basso su telefono.
- Stato salvato sul profilo (migrazione 0011), "Rivedi il tutorial" in Account ("Replay the tour"); E2E per completamento, salto, riapertura e le tre larghezze.

### Fase 5. Pronti per la produzione
- `/health` e `/readyz` (database e migrazioni), log strutturati, gestione errori uniforme, versione visibile nell'app.
- Migrazioni con lock, `docker-compose.prod.yml` con HTTPS automatico, script di backup e ripristino provati davvero (dump cifrato, ripristino, conteggi, RLS, API avviata sulla copia).
- Workflow di uptime con issue automatiche, release da tag con note dal CHANGELOG.

### Fase 6. Documentazione
- Nuovi: [ARCHITECTURE.md](ARCHITECTURE.md), [OPERATIONS.md](OPERATIONS.md), [API.md](API.md) con [OpenAPI](api/openapi.json), [USER_GUIDE.md](USER_GUIDE.md), questa checklist, la review di sicurezza.
- Aggiornati: [DEPLOYMENT.md](DEPLOYMENT.md) con tutte le variabili, [SECURITY.md](../SECURITY.md), [security/overview.md](security/overview.md), roadmap, handoff, CONTRIBUTING, CHANGELOG, README e gli screenshot.

## 3. Cosa devi fare tu entro la prossima settimana

In ordine di priorità. Non incollare mai i valori in chat: vanno solo nei pannelli dei servizi.

1. **Ruota la password del database.** Supabase, progetto `galdus-ai`, **SQL Editor**: `alter role galdus_app with password '<nuova password lunga e casuale>';`. Poi Render, servizio `galdus-api`, **Environment**, modifica `DATABASE_URL` con la nuova password, **Save changes**. Verifica che `https://galdus-api.onrender.com/readyz` risponda `ready`. Se usi anche la password `postgres` del progetto: Supabase, **Database, Settings, Reset database password**.
2. **Salva `ENCRYPTION_KEY`.** Render, `galdus-api`, **Environment**, mostra `ENCRYPTION_KEY` e copiala nel tuo password manager. Senza di essa backup e chiavi dei fornitori non sono leggibili.
3. **Controlla il deploy** (la pull request è già unita). Render, **Events**: verifica che l'ultimo deploy sia riuscito; apri `/readyz` e controlla `"migrations":"ok"` e `"version":"1.0.0-rc.1"`. Il deploy fallisce in sicurezza se manca una variabile obbligatoria: in quel caso il messaggio nei log di Render indica quale.
4. **Cambia la password admin temporanea.** Accedi alla console, **Account, Change password** (le altre sessioni vengono chiuse), poi **Account, Two-step verification, Turn on** e conserva i codici di recupero.
5. **Imposta `LEGAL_EMAIL`.** GitHub, repository, **Settings, Secrets and variables, Actions, Variables, New repository variable**: `LEGAL_EMAIL` (e se vuoi `LEGAL_ADDRESS`). Poi **Actions, Deploy web to GitHub Pages, Run workflow**. Controlla `https://coobox-89.github.io/galdus.ai/privacy`.
6. **Accetta i DPA dei fornitori** (la privacy policy dichiara clausole contrattuali standard per i trasferimenti). Supabase: dashboard, **Organization settings, Legal documents**, firma il DPA. Render: **Workspace settings**, sezione legale/DPA (oppure dal sito Render, pagina DPA). Fai lo stesso con il provider SMTP che sceglierai al passo 8. Conserva le copie firmate. Facoltativo ma consigliato: far rileggere le pagine legali a un consulente.
7. **Collega almeno un modello**, altrimenti chat, agenti, app e automazioni non rispondono. Due modi:
   - **Consigliato (BYOK):** nella console, **Models**, scegli un fornitore (per esempio OpenAI, Anthropic, Gemini, Mistral, Groq o OpenRouter), incolla la tua chiave API e premi **Test and connect**. Vale per il tuo workspace; ogni workspace collega le proprie chiavi.
   - **Modello della piattaforma per tutti:** Render, **Environment**, imposta `OPENAI_API_KEY` (resta `ALLOWED_MODELS=openai/gpt-4o-mini`). Da questa versione il modello compare nella chat solo se la chiave c'è davvero; i costi sono tuoi e vale il limite `DAILY_TOKEN_BUDGET_PER_USER`.
8. **Configura SMTP su Render.** Scegli un provider (Brevo, Resend, Mailgun), verifica il dominio mittente, poi in Render **Environment**: `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Dopo una prova di reset password, aggiungi `REQUIRE_EMAIL_VERIFICATION=true`.
9. **Configura OAuth su Render.** Segui [DEPLOYMENT.md, A4](DEPLOYMENT.md#a4-sign-in-with-google-github-microsoft-and-cloud-drives) oppure la console, **Platform admin, Setup** (mostra gli URI da copiare):
   - Google Cloud Console: client OAuth Web, URI `https://galdus-api.onrender.com/api/v1/auth/oauth/google/callback` e `.../api/v1/connectors/google/callback`; variabili `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
   - GitHub, **Settings, Developer settings, OAuth Apps**: URI `.../api/v1/auth/oauth/github/callback`; `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
   - Microsoft Entra, **App registrations**: URI `.../api/v1/auth/oauth/microsoft/callback` e `.../api/v1/connectors/microsoft/callback`; `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (`MICROSOFT_TENANT=common`).
10. **Attiva lo scheduler** (se non già fatto): genera un valore casuale, impostalo come `AUTOMATION_TOKEN` su Render e come secret `GALDUS_AUTOMATION_TOKEN` in GitHub, **Settings, Secrets and variables, Actions, Secrets**.
11. **Completa GitHub.** **Settings, General, Social preview, Edit, Upload** con `docs/assets/social-preview.png`. Nella pagina del repository, ingranaggio accanto ad **About**: descrizione, sito `https://coobox-89.github.io/galdus.ai/`, topic (ai, llm, self-hosted, fastapi, react). **Settings, Code security**: attiva **Private vulnerability reporting** e **Dependabot alerts**. In alto, **Watch, All activity** per ricevere gli avvisi `incident`.
12. **Primo backup.** Dal tuo computer: `DATABASE_URL=... BACKUP_PASSPHRASE=... ./scripts/backup-db.sh ~/galdus-backups` ([OPERATIONS.md](OPERATIONS.md#backups)); salva la passphrase nel password manager.
13. **Netlify.** Il sito `galdus-ai` su Netlify non è più usato e la sua configurazione è stata rimossa: eliminalo o scollegalo dal repository (Netlify, **Site configuration, Delete site**), altrimenti i suoi build falliranno.
14. **Materiali grafici.** Fornisci il simbolo ufficiale di Together AI (SVG dal suo brand kit, da mettere in `apps/web/public/brand/providers/together_ai.svg`) e l'immagine del vichingo ad alta risoluzione (almeno 2500 px di larghezza, sorgente senza compressione) per sostituire le versioni attuali.
15. **Tagga la release candidate** dopo i passi 1-7: `git tag v1.0.0-rc.1 && git push origin v1.0.0-rc.1`. Dopo una settimana senza problemi, porta la versione a `1.0.0` e tagga `v1.0.0`.

Facoltativo: `RATE_LIMIT_BACKEND=postgres` su Render per non azzerare i blocchi a ogni riavvio.

### Tutte le funzionalità da collegare

| Funzionalità | Senza configurazione | Cosa serve | Dove | Passo |
|:--|:--|:--|:--|:--|
| Modelli (chat, agenti, app, automazioni) | Non rispondono | Una chiave del fornitore | Console, **Models** (oppure `OPENAI_API_KEY` su Render) | 7 |
| Ricerca semantica nella knowledge | Ricerca per parole chiave (funziona) | Un modello di embedding su una connessione | Console, **Knowledge**, nuova collezione | facoltativo |
| Email: verifica, reset password, inviti | Nessuna email; l'invito si copia a mano | SMTP | Render, `SMTP_*` | 8 |
| Accesso con Google, GitHub, Microsoft | Solo email e password | App OAuth | Google Cloud, GitHub, Microsoft Entra, poi Render | 9 |
| Google Drive, SharePoint, OneDrive | Non disponibili | Le stesse app OAuth di Google e Microsoft, con Drive API e permessi Graph | Come sopra, poi console, **Integrations** | 9 |
| Automazioni pianificate e risincronizzazione drive | Solo webhook e "Run now" | `AUTOMATION_TOKEN` | Render e GitHub Secrets | 10 |
| Invio risultati a Slack o Teams | Nessun invio | URL webhook in entrata di Slack o Teams | Console, wizard delle automazioni | facoltativo |
| Server MCP per gli agenti | Solo strumenti integrati | URL del server MCP ed eventuale token | Console, **Integrations** | facoltativo |
| Contatto nelle pagine legali | Pagine senza contatto | `LEGAL_EMAIL` | GitHub Variables | 5 |
| Avvisi di disservizio | Nessun avviso | Watch sul repository | GitHub | 11 |

## 4. Rischi residui accettati

Descritti con le mitigazioni nella [review](security/review-2026-11-27.md#residual-risks-accepted):

| Rischio | Mitigazione |
|:--|:--|
| Dietro Render l'IP del client può essere falsificato e i limiti per IP aggirati | Blocchi per account e per utente indipendenti dall'IP; `CLIENT_IP_HEADER` se il proxy fornisce un header affidabile |
| Senza SMTP la registrazione rivela se un'email esiste | Limite per IP; si chiude con SMTP e `REQUIRE_EMAIL_VERIFICATION=true` (passo 6) |
| Token di sessione in `sessionStorage` | CSP stretta, scadenza 30 minuti, revoca; cookie httpOnly quando console e API saranno sullo stesso dominio |
| DNS rebinding sugli URL forniti dagli utenti | Solo owner e admin configurano endpoint; https obbligatorio; nessun servizio interno sensibile su Render |
| Blocco di un account da parte di chi conosce l'email | Finestra di 15 minuti; il reset password resta disponibile |
| Su GitHub Pages niente header (`frame-ancestors`) | CSP come meta tag; azioni sensibili chiedono password o codice; il setup Docker invia gli header |
| Prompt injection da documenti e strumenti | Contenuti delimitati e neutralizzati, strumenti MCP in allowlist |
| Supabase free senza backup scaricabili | Backup cifrati settimanali con script provato, prova di ripristino trimestrale |

Quando i passi 1-7 sono fatti, per l'anteprima a costo zero non resta nulla di bloccante: i passi 8-15 completano funzionalità e presentazione.
