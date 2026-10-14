from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class TokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    client_id: Annotated[str, Field(min_length=1, max_length=128)]
    client_secret: Annotated[str, Field(min_length=1, max_length=512)]


class TokenRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: Annotated[int, Field(description="Seconds until the token expires")]
    expires_at: datetime


class ClientRead(BaseModel):
    model_config = ConfigDict(extra="forbid")

    client_id: str
    token_id: str
    expires_at: datetime


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: str
    code: str
