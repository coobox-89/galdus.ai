from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from .config import settings


def engine_options() -> dict:
    """Engine options tuned for a long-running container talking to managed Postgres.

    When the URL points at a transaction-mode pooler (Supabase Supavisor, PgBouncer),
    prepared statements must be disabled and pooling is left to the pooler.
    """
    if settings.db_transaction_pooler:
        return {
            "poolclass": NullPool,
            "connect_args": {"statement_cache_size": 0, "prepared_statement_cache_size": 0},
        }
    return {
        "pool_pre_ping": True,
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_timeout": settings.db_pool_timeout,
        "pool_recycle": settings.db_pool_recycle,
    }


engine = create_async_engine(settings.database_url, **engine_options())
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session
