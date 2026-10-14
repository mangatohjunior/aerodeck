import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.certificate import Certificate, CertificateStatus


class CertificateRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, certificate: Certificate) -> Certificate:
        self._session.add(certificate)
        await self._session.flush()
        return certificate

    async def get_for_route(self, route_id: uuid.UUID) -> Certificate | None:
        result = await self._session.execute(select(Certificate).where(Certificate.route_id == route_id))
        return result.scalar_one_or_none()

    async def list_issued(self) -> Sequence[Certificate]:
        rows = await self._session.scalars(
            select(Certificate)
            .where(
                Certificate.status == CertificateStatus.issued,
                Certificate.certificate_pem.is_not(None),
                Certificate.private_key_pem.is_not(None),
            )
            .order_by(Certificate.hostname)
        )
        return rows.all()

    async def list_due(self, deadline: datetime) -> Sequence[Certificate]:
        rows = await self._session.scalars(
            select(Certificate)
            .where(
                Certificate.status == CertificateStatus.issued,
                Certificate.not_after.is_not(None),
                Certificate.not_after <= deadline,
            )
            .order_by(Certificate.not_after)
        )
        return rows.all()
