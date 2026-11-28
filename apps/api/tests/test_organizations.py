# Galdus.ai
# Copyright (C) 2026 Mario Cubello
# Author: Mario Cubello
# SPDX-License-Identifier: AGPL-3.0-only

import asyncio
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.identity import organizations


def test_organizations_query_is_scoped_to_authenticated_user():
    user_id = uuid.uuid4()
    organization = SimpleNamespace(
        id=uuid.uuid4(),
        name="Private workspace",
        slug="private-workspace",
    )
    result = SimpleNamespace(all=lambda: [(organization, "member")])
    db = AsyncMock()
    db.execute.return_value = result

    response = asyncio.run(
        organizations(user=SimpleNamespace(id=user_id), db=db)
    )

    assert len(response) == 1
    assert response[0].id == organization.id
    assert response[0].role == "member"

    statement = db.execute.await_args.args[0]
    compiled = str(statement.compile(compile_kwargs={"literal_binds": True}))
    assert "memberships.user_id" in compiled
    # SQLAlchemy's PostgreSQL UUID literal renderer uses the 32-char hex form.
    assert user_id.hex in compiled
