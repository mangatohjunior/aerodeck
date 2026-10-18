import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.console_user import ConsoleUserRead


class ConsoleSessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: uuid.UUID


class ConsoleSessionToken(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    token: Annotated[str, Field(min_length=1, max_length=200)]


class ConsoleSessionIssued(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str
    user: ConsoleUserRead
