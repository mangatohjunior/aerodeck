import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field


def _lowercase_email(value: object) -> object:
    if isinstance(value, str):
        return value.lower()
    return value


Email = Annotated[
    str,
    BeforeValidator(_lowercase_email),
    Field(min_length=3, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"),
]
Password = Annotated[str, Field(min_length=8, max_length=128)]


class ConsoleUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: Email
    password: Password


class ConsoleUserGoogleLink(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: Email
    subject: Annotated[str, Field(min_length=1, max_length=255)]


class ConsoleUserRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    email: str
    created_at: datetime
    updated_at: datetime
