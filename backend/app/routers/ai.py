"""
AI Router - /api/ai

Provides AI-powered task breakdown and prioritization using OpenAI.
Implements the Strategy Pattern: each AI feature is a separate strategy class.
The OpenAIAdapter isolates all SDK communication from business logic.

Rate limiting: 10 AI requests per user per hour (enforced in-memory).
"""

import os
import time
from abc import ABC, abstractmethod
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from openai import AsyncOpenAI

from app.models import AIBreakdownRequest, AIBreakdownResponse, AIPrioritizeRequest, AIPrioritizeResponse
from app.auth import get_current_user
from app.db import get_db

router = APIRouter()

# ── Simple in-memory rate limiter ─────────────────────────────────────────────
_rate_limit: dict = {}  # {user_id: [timestamps]}
RATE_LIMIT_MAX = 10
RATE_LIMIT_WINDOW = 3600  # seconds


def _check_rate_limit(user_id: str):
    now = time.time()
    timestamps = _rate_limit.get(user_id, [])
    timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    if len(timestamps) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="AI rate limit exceeded. Try again in an hour.")
    timestamps.append(now)
    _rate_limit[user_id] = timestamps


# ── OpenAI Adapter (Adapter Pattern) ─────────────────────────────────────────

class OpenAIAdapter:
    """
    Adapter class wrapping the OpenAI AsyncClient.

    Isolates all third-party API details (key management, model selection,
    request formatting, error handling) from the service layer.
    Only this class communicates with OpenAI — the rest of the app calls callLLM().

    Attributes:
        client: AsyncOpenAI instance (or None if key is not configured).
        model: OpenAI model string to use for completions.
    """

    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        self.client = AsyncOpenAI(api_key=api_key) if api_key else None
        self.model = "gpt-4o-mini"

    async def call_llm(self, prompt: str) -> str:
        """
        Send a prompt to the OpenAI chat completion endpoint and return the response text.

        Args:
            prompt: The fully constructed prompt string.

        Returns:
            The model's text response.

        Raises:
            HTTPException 503: If OpenAI API key is not configured.
            HTTPException 502: If the OpenAI API call fails.
        """
        if not self.client:
            raise HTTPException(
                status_code=503,
                detail="AI features require an OpenAI API key. Core features still work."
            )
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=500,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")


_adapter = OpenAIAdapter()


# ── Strategy Pattern ──────────────────────────────────────────────────────────

class AIStrategy(ABC):
    """
    Abstract base class for AI feature strategies.

    All AI features share the same scaffolding (adapter call, error handling)
    but differ in how they build the prompt and parse the response.
    New AI features are added as new strategy subclasses — no existing code changes.
    """

    @abstractmethod
    def build_prompt(self, data: dict) -> str:
        """Construct the prompt to send to the LLM."""

    @abstractmethod
    def parse_response(self, response: str) -> any:
        """Parse the raw LLM response into structured output."""

    async def execute(self, data: dict) -> any:
        prompt = self.build_prompt(data)
        response = await _adapter.call_llm(prompt)
        return self.parse_response(response)


class BreakdownStrategy(AIStrategy):
    """
    Strategy for decomposing a complex task into manageable subtasks.

    Prompts the LLM to generate a numbered list of actionable subtasks
    and parses the response into a clean list of strings.
    """

    def build_prompt(self, data: dict) -> str:
        title = data["title"]
        desc = data.get("description", "")
        return (
            f"Break down this task into 3-6 clear, actionable subtasks:\n"
            f"Task: {title}\n"
            f"Details: {desc}\n\n"
            f"Return ONLY a numbered list like:\n1. Subtask one\n2. Subtask two\nNo extra explanation."
        )

    def parse_response(self, response: str) -> List[str]:
        lines = response.strip().split("\n")
        subtasks = []
        for line in lines:
            line = line.strip()
            if line and line[0].isdigit():
                # Remove leading "1. " or "1) "
                cleaned = line.split(". ", 1)[-1].split(") ", 1)[-1].strip()
                if cleaned:
                    subtasks.append(cleaned)
        return subtasks if subtasks else [response]


class PrioritizeStrategy(AIStrategy):
    """
    Strategy for ranking a list of tasks by urgency and importance.

    Prompts the LLM to return tasks ordered from highest to lowest priority
    with a brief justification for each.
    """

    def build_prompt(self, data: dict) -> str:
        tasks = data["tasks"]
        task_list = "\n".join([f"- {t.get('title', 'Untitled')} (deadline: {t.get('deadline', 'none')})" for t in tasks])
        return (
            f"Rank these tasks from highest to lowest priority based on urgency and importance:\n"
            f"{task_list}\n\n"
            f"Return ONLY a numbered list of task titles in priority order. No extra text."
        )

    def parse_response(self, response: str) -> List[str]:
        lines = response.strip().split("\n")
        ordered = []
        for line in lines:
            line = line.strip()
            if line and line[0].isdigit():
                cleaned = line.split(". ", 1)[-1].split(") ", 1)[-1].strip()
                if cleaned:
                    ordered.append(cleaned)
        return ordered


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/breakdown", response_model=AIBreakdownResponse)
async def breakdown_task(data: AIBreakdownRequest, user=Depends(get_current_user), db=Depends(get_db)):
    """
    Generate AI subtasks for a complex task using BreakdownStrategy.

    Args:
        data: AIBreakdownRequest with task_id, task_title, and optional description.

    Returns:
        AIBreakdownResponse with the task_id and a list of suggested subtask strings.

    Raises:
        HTTPException 429: If rate limit exceeded.
        HTTPException 503: If OpenAI key not configured.
    """
    _check_rate_limit(str(user["_id"]))
    strategy = BreakdownStrategy()
    subtasks = await strategy.execute({
        "title": data.task_title,
        "description": data.task_description,
    })
    return AIBreakdownResponse(task_id=data.task_id, subtasks=subtasks)


@router.post("/prioritize", response_model=AIPrioritizeResponse)
async def prioritize_tasks(data: AIPrioritizeRequest, user=Depends(get_current_user)):
    """
    Rank a list of tasks by urgency and importance using PrioritizeStrategy.

    Args:
        data: AIPrioritizeRequest containing a list of task dicts with title and deadline.

    Returns:
        AIPrioritizeResponse with tasks sorted by AI priority score.

    Raises:
        HTTPException 429: If rate limit exceeded.
    """
    _check_rate_limit(str(user["_id"]))
    strategy = PrioritizeStrategy()
    ordered_titles = await strategy.execute({"tasks": data.tasks})

    # Re-map original task objects to the AI's ordering
    title_to_task = {t.get("title"): t for t in data.tasks}
    prioritized = [title_to_task[t] for t in ordered_titles if t in title_to_task]
    # Append any tasks not matched by the AI
    matched = set(ordered_titles)
    for t in data.tasks:
        if t.get("title") not in matched:
            prioritized.append(t)

    return AIPrioritizeResponse(prioritized_tasks=prioritized)
