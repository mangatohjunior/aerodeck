import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class EnvironmentKind(enum.StrEnum):
    """Mirrors the `environment` variable in packages/iac-engine."""

    dev = "dev"
    staging = "staging"
    prod = "prod"


class Project(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    slug: Mapped[str] = mapped_column(String(63), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000))

    environments: Mapped[list["Environment"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", passive_deletes=True
    )


class Environment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "environments"
    __table_args__ = (UniqueConstraint("project_id", "slug", name="uq_environments_project_id_slug"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slug: Mapped[str] = mapped_column(String(63), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[EnvironmentKind] = mapped_column(
        Enum(EnvironmentKind, name="environment_kind", native_enum=False, length=16), nullable=False
    )
    region: Mapped[str] = mapped_column(String(16), nullable=False, default="nyc3")

    project: Mapped[Project] = relationship(back_populates="environments")
