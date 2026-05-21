from pydantic import BaseModel, Field


class DocumentMetadata(BaseModel):
    """LLM-extracted structured metadata from a document."""

    title: str = Field(
        default="",
        description="A concise title for the document, inferred from content.",
    )
    author: str = Field(
        default="",
        description="Author or creator. Empty if not determinable.",
    )
    topics: list[str] = Field(
        default_factory=list,
        description="3-8 keywords or topic tags, e.g. ['reinforcement learning', 'Q-learning']",
    )
    document_type: str = Field(
        default="unknown",
        description="One of: report, article, manual, legal, academic_paper, presentation, email, meeting_notes, specification, tutorial, blog_post, other, unknown",
    )
    language: str = Field(
        default="unknown",
        description="Primary language as ISO 639-1 code (zh, en, ja, etc.)",
    )
    summary: str = Field(
        default="",
        description="A 2-4 sentence summary of the document's main content.",
    )


class ToolCallRecord(BaseModel):
    """Standardized tool call record for storage and transmission."""
    id: str
    name: str
    arguments: str
    result: str | None = None
    status: str = "done"  # "running" | "done" | "error"
    children: list["ToolCallRecord"] | None = None
    reasoning: list[str] | None = None


class SubAgentResult(BaseModel):
    """Result from a sub-agent execution."""
    answer: str
    tool_calls: list[ToolCallRecord] = []
    reasoning: list[str] = []
