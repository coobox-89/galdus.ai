<p align="center"><img src="assets/header-docs.jpg" alt="Galdus.ai API" width="100%"></p>

# API reference

The API is REST over HTTPS with JSON bodies, plus Server-Sent Events for streamed chat answers.

- **OpenAPI document**: [`docs/api/openapi.json`](api/openapi.json), generated from the code (`python -m app.openapi_export`) and checked by CI, so it always matches the release. Open it in any OpenAPI viewer (for example paste it into editor.swagger.io).
- **Interactive docs**: `/docs` and `/redoc` on a development API (`ENVIRONMENT=development`, for example `http://localhost:8000/docs`). They are off in production unless `ENABLE_API_DOCS=true`.

## Conventions

| Topic | Rule |
|:--|:--|
| Base URL | `https://<api-host>/api/v1` (preview: `https://galdus-api.onrender.com/api/v1`) |
| Authentication | `Authorization: Bearer <access_token>` from `POST /auth/login`, `POST /auth/mfa/verify` or the OAuth callback. Tokens last `JWT_EXPIRE_MINUTES` (30) and are revoked by password change, reset and `POST /auth/logout-all`. |
| Workspace | Workspace endpoints act in the workspace given by `X-Organization-Id: <uuid>`, or the caller's oldest workspace when absent. Non-members get 403. |
| Roles | owner, admin, member. Writes to models, knowledge, agents, automations, MCP servers and drives need owner or admin; workspace settings and roles need owner. |
| Errors | `{"detail": "...", "request_id": "..."}`; validation errors have `detail` as a list of `{loc, msg, type}` (submitted values are not echoed). Every response has `X-Request-ID`. |
| Limits | 429 with `Retry-After` when a rate limit or the per-account lockout applies; 413 for oversized bodies (1 MB JSON, 5 MB uploads, 6 MB chat with images). |
| Versioning | The path carries the major version (`/api/v1`); the release version is in `/health`. |

## Quick example

```bash
API=http://localhost:8000/api/v1
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<your password>"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')
curl -s $API/auth/me -H "Authorization: Bearer $TOKEN"
curl -s $API/conversations -H "Authorization: Bearer $TOKEN"
```

Inbound automation webhook (no token header: the secret is the path, shown once when the automation is created):

```bash
curl -s -X POST https://<api-host>/api/v1/hooks/<webhook-token> -H 'Content-Type: application/json' -d '{"input":"Ticket 4211: VPN down in Milan"}'
```

## Endpoints

### Operations

| Method | Path | Summary |
|:--|:--|:--|
| `GET` | `/health` | Health |
| `GET` | `/readyz` | Readiness |

### Identity

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/auth/account/delete` | Delete Account |
| `GET` | `/api/v1/auth/export` | Export Account |
| `POST` | `/api/v1/auth/login` | Login |
| `GET` | `/api/v1/auth/me` | Me |
| `GET` | `/api/v1/auth/organizations` | Organizations |
| `POST` | `/api/v1/auth/register` | Register |

### Accounts

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/auth/logout-all` | Logout All |
| `DELETE` | `/api/v1/auth/me/avatar` | Delete Avatar |
| `PUT` | `/api/v1/auth/me/avatar` | Update Avatar |
| `PUT` | `/api/v1/auth/me/profile` | Update Profile |
| `GET` | `/api/v1/auth/oauth/{provider}/callback` | Oauth Callback |
| `GET` | `/api/v1/auth/oauth/{provider}/start` | Oauth Start |
| `POST` | `/api/v1/auth/password/change` | Change |
| `POST` | `/api/v1/auth/password/forgot` | Forgot |
| `POST` | `/api/v1/auth/password/reset` | Reset |
| `GET` | `/api/v1/auth/preferences` | Get Prefs |
| `PUT` | `/api/v1/auth/preferences` | Put Prefs |
| `GET` | `/api/v1/auth/providers` | Providers |
| `POST` | `/api/v1/auth/verify-email` | Verify Email |
| `POST` | `/api/v1/auth/verify-email/resend` | Resend Verification |

### Mfa

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/auth/mfa/disable` | Disable |
| `POST` | `/api/v1/auth/mfa/enable` | Enable |
| `POST` | `/api/v1/auth/mfa/recovery-codes` | Regenerate |
| `POST` | `/api/v1/auth/mfa/setup` | Setup |
| `GET` | `/api/v1/auth/mfa/status` | Status |
| `POST` | `/api/v1/auth/mfa/verify` | Verify |

### Onboarding

| Method | Path | Summary |
|:--|:--|:--|
| `GET` | `/api/v1/auth/onboarding` | Get Onboarding |
| `PUT` | `/api/v1/auth/onboarding` | Set Onboarding |

### Governance

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/invitations/accept` | Accept Invitation |
| `GET` | `/api/v1/org/audit` | List Audit |
| `GET` | `/api/v1/org/invitations` | List Invitations |
| `POST` | `/api/v1/org/invitations` | Invite |
| `DELETE` | `/api/v1/org/invitations/{invitation_id}` | Revoke Invitation |
| `GET` | `/api/v1/org/members` | Members |
| `DELETE` | `/api/v1/org/members/{user_id}` | Remove Member |
| `PATCH` | `/api/v1/org/members/{user_id}` | Change Role |
| `GET` | `/api/v1/org/settings` | Get Settings |
| `PUT` | `/api/v1/org/settings` | Update Settings |

### Models

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/models/check` | Check Key |
| `GET` | `/api/v1/models/connections` | List Connections |
| `POST` | `/api/v1/models/connections` | Create Connection |
| `DELETE` | `/api/v1/models/connections/{connection_id}` | Delete Connection |
| `POST` | `/api/v1/models/connections/{connection_id}/test` | Test Connection |
| `GET` | `/api/v1/models/providers` | Providers |

### Chat

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/chat/completions` | Chat |
| `GET` | `/api/v1/models` | List Models |

### Conversations

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/chat/attachments` | Attachment |
| `GET` | `/api/v1/chat/personas` | Personas |
| `GET` | `/api/v1/conversations` | List Conversations |
| `POST` | `/api/v1/conversations` | Create Conversation |
| `DELETE` | `/api/v1/conversations/{cid}` | Delete Conversation |
| `GET` | `/api/v1/conversations/{cid}` | Read Conversation |
| `PUT` | `/api/v1/conversations/{cid}` | Update Conversation |
| `POST` | `/api/v1/conversations/{cid}/messages` | Send Message |
| `DELETE` | `/api/v1/conversations/{cid}/messages/last` | Drop Last Answer |

### Knowledge

| Method | Path | Summary |
|:--|:--|:--|
| `GET` | `/api/v1/knowledge/collections` | List Collections |
| `POST` | `/api/v1/knowledge/collections` | Create Collection |
| `DELETE` | `/api/v1/knowledge/collections/{collection_id}` | Delete Collection |
| `GET` | `/api/v1/knowledge/collections/{collection_id}/documents` | List Documents |
| `POST` | `/api/v1/knowledge/collections/{collection_id}/documents/text` | Add Text |
| `POST` | `/api/v1/knowledge/collections/{collection_id}/documents/upload` | Upload |
| `POST` | `/api/v1/knowledge/collections/{collection_id}/documents/url` | Add Url |
| `POST` | `/api/v1/knowledge/collections/{collection_id}/search` | Search |
| `DELETE` | `/api/v1/knowledge/documents/{document_id}` | Delete Document |

### Connectors

| Method | Path | Summary |
|:--|:--|:--|
| `GET` | `/api/v1/connectors` | List Connectors |
| `POST` | `/api/v1/connectors/documents/{document_id}/resync` | Resync |
| `DELETE` | `/api/v1/connectors/{connection_id}` | Disconnect |
| `GET` | `/api/v1/connectors/{connection_id}/files` | Browse |
| `POST` | `/api/v1/connectors/{connection_id}/import` | Import Files |
| `POST` | `/api/v1/connectors/{kind}/authorize` | Authorize |
| `GET` | `/api/v1/connectors/{provider}/callback` | Callback |
| `POST` | `/api/v1/connectors/{provider}/complete` | Complete |

### Agents

| Method | Path | Summary |
|:--|:--|:--|
| `GET` | `/api/v1/agents` | List Agents |
| `POST` | `/api/v1/agents` | Create Agent |
| `DELETE` | `/api/v1/agents/{agent_id}` | Delete Agent |
| `PUT` | `/api/v1/agents/{agent_id}` | Update Agent |
| `POST` | `/api/v1/agents/{agent_id}/runs` | Run Agent |
| `GET` | `/api/v1/apps` | List Apps |
| `POST` | `/api/v1/apps/{app_id}/runs` | Run App |
| `GET` | `/api/v1/runs` | List Runs |

### Integrations

| Method | Path | Summary |
|:--|:--|:--|
| `GET` | `/api/v1/integrations/builtin-tools` | Builtin Tools |
| `GET` | `/api/v1/integrations/mcp` | List Mcp |
| `POST` | `/api/v1/integrations/mcp` | Add Mcp |
| `DELETE` | `/api/v1/integrations/mcp/{server_id}` | Delete Mcp |
| `PUT` | `/api/v1/integrations/mcp/{server_id}/allowed-tools` | Set Allowed |
| `GET` | `/api/v1/integrations/mcp/{server_id}/tools` | Discover |

### Automation

| Method | Path | Summary |
|:--|:--|:--|
| `POST` | `/api/v1/automation/tick` | Tick |
| `GET` | `/api/v1/automations` | List Automations |
| `POST` | `/api/v1/automations` | Create Automation |
| `DELETE` | `/api/v1/automations/{automation_id}` | Delete Automation |
| `PATCH` | `/api/v1/automations/{automation_id}` | Toggle |
| `POST` | `/api/v1/automations/{automation_id}/run` | Run Now |
| `GET` | `/api/v1/automations/{automation_id}/runs` | Automation Runs |
| `POST` | `/api/v1/hooks/{token}` | Webhook |

### Admin

| Method | Path | Summary |
|:--|:--|:--|
| `GET` | `/api/v1/admin/organizations` | Organizations |
| `GET` | `/api/v1/admin/overview` | Overview |
| `GET` | `/api/v1/admin/setup` | Setup |
| `GET` | `/api/v1/admin/usage` | Usage |
| `GET` | `/api/v1/admin/users` | Users |
| `POST` | `/api/v1/admin/users/{user_id}/admin` | Set Admin |
