"""remove fixed dimension from embedding column

Revision ID: 0004
Revises: 0003
Create Date: 2026-04-09

The original column was Vector(1536), hard-coded for OpenAI text-embedding-3-small.
Ollama embedding models produce different dimensions (llama3.2 → 3072,
nomic-embed-text → 768), which caused silent failures.

Removing the dimension constraint lets pgvector store any consistent dimension.
Note: all recipes must be re-indexed after changing the embedding model, because
pgvector's cosine operator requires vectors of equal dimension within a comparison.
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Clear existing embeddings first (they may be incompatible dimension)
    op.execute("UPDATE recipes SET embedding = NULL")
    # Drop the dimension constraint; keep the column as plain 'vector'
    op.execute("ALTER TABLE recipes ALTER COLUMN embedding TYPE vector USING embedding::vector")


def downgrade() -> None:
    op.execute("UPDATE recipes SET embedding = NULL")
    op.execute("ALTER TABLE recipes ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector(1536)")
