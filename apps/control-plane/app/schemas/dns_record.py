import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.dns_record import DnsRecordStatus, DnsRecordType


class DnsRecordRead(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    route_id: uuid.UUID
    hostname: str
    record_type: DnsRecordType
    data: str
    ttl: int
    status: DnsRecordStatus
    created_at: datetime
    updated_at: datetime
