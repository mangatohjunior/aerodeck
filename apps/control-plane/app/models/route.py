import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.project import Environment, Project


class Route(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A hostname Traefik should send to one backend. Hostnames are unique platform-wide."""

    __tablename__ = "routes"
    __table_args__ = (UniqueConstraint("hostname", name="uq_routes_hostname"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    environment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("environments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hostname: Mapped[str] = mapped_column(String(253), nullable=False)
    path_prefix: Mapped[str] = mapped_column(String(200), nullable=False, default="/")
    backend_host: Mapped[str] = mapped_column(String(253), nullable=False)
    backend_port: Mapped[int] = mapped_column(Integer, nullable=False)
    entrypoint: Mapped[str] = mapped_column(String(32), nullable=False, default="web")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    project: Mapped[Project] = relationship()
    environment: Mapped[Environment] = relationship(back_populates="routes")
    certificate: Mapped["Certificate | None"] = relationship(
        back_populates="route", cascade="all, delete-orphan", uselist=False, passive_deletes=True
    )
