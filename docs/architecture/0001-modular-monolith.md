# ADR 0001: Modular monolith first

- Status: Accepted
- Decision: Begin with a modular monolith and explicit domain boundaries.
- Rationale: Keep local development and deployment understandable while the product surface is changing. Extract services only when scaling, isolation, or team ownership provides a concrete reason.
- Initial domains: model gateway, agents, knowledge, automation, governance, identity.
