"""
AI Router - /api/ai

Provides AI-powered task breakdown and prioritization using OpenAI.
Implements the Strategy Pattern: each AI feature is a separate strategy class.
The OpenAIAdapter isolates all SDK communication from business logic.

Rate limiting: 10 AI requests per user per hour (enforced in-memory).
"""

import json
import os
import time
from abc import ABC, abstractmethod
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from app.models import (
    AIBreakdownRequest,
    AIBreakdownResponse,
    AIPrioritizeRequest,
    AIPrioritizeResponse,
    AIGenerateTasksRequest,
    AIGenerateTasksResponse,
    AIRefineTasksRequest,
    GeneratedTask,
)
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
        self.client = None
        if api_key:
            from openai import AsyncOpenAI
            self.client = AsyncOpenAI(api_key=api_key)
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
            f"Return ONLY a numbered list like:\n"
            f"1. Subtask one\n"
            f"2. Subtask two\n"
            f"No extra explanation."
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
        task_lines = []
        for t in tasks:
            task_lines.append(
                f"- {t.get('title', 'Untitled')} (deadline: {t.get('deadline', 'none')})"
            )
        task_list = "\n".join(task_lines)
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
async def breakdown_task(
    data: AIBreakdownRequest,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
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


# ── Gemini-powered Task Generation ──────────────────────────────────────

GENERATE_PROMPT = """You are a productivity assistant. The user wants to accomplish a goal.
Break it down into 3-6 actionable tasks.

For each task, provide:
- title: A clear, actionable task title
- description: A brief description of what needs to be done
- priority: HIGH, MEDIUM, or LOW
- category: A short category label (e.g., "Research", "Development", "Design")

Also provide a one-line summary of the overall plan.

Respond ONLY with valid JSON in this exact format (no markdown, no code fences):
{
  "summary": "One-line summary of the plan",
  "tasks": [
    {"title": "...", "description": "...", "priority": "MEDIUM", "category": "..."}
  ]
}

User's goal: """

REFINE_PROMPT = """You are a productivity assistant. The user previously asked to break down a goal
into tasks. They have reviewed the tasks and want changes.

Original goal: {goal}

Current tasks:
{tasks_json}

User's feedback: {feedback}

Update the tasks based on the feedback. You may add, remove, or modify tasks.

Respond ONLY with valid JSON in this exact format (no markdown, no code fences):
{{
  "summary": "Updated one-line summary of the plan",
  "tasks": [
    {{"title": "...", "description": "...", "priority": "MEDIUM", "category": "..."}}
  ]
}}"""


async def _call_gemini(api_key: str, prompt: str) -> str:
    """Call Google Gemini API and return the text response."""
    from google import genai

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text.strip()
    except Exception as e:
        err_str = str(e)
        if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
            raise HTTPException(
                status_code=429,
                detail=(
                    "Gemini API quota exceeded. Please wait a minute "
                    "and try again, or use a different API key."
                ),
            )
        raise HTTPException(
            status_code=502, detail=f"Gemini API error: {err_str}"
        )


def _parse_gemini_response(raw: str) -> dict:
    """Parse the JSON response from Gemini, handling markdown fences."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # remove opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502,
            detail="AI returned an invalid response. Please try again."
        )


@router.post("/generate-tasks", response_model=AIGenerateTasksResponse)
async def generate_tasks(
    data: AIGenerateTasksRequest,
    user=Depends(get_current_user),
):
    """Generate tasks from a goal description using the user's Gemini API key."""
    _check_rate_limit(str(user["_id"]))

    api_key = user.get("gemini_api_key")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Please set your Gemini API key first."
        )

    prompt = GENERATE_PROMPT + data.goal
    raw = await _call_gemini(api_key, prompt)
    parsed = _parse_gemini_response(raw)

    tasks = []
    for t in parsed.get("tasks", []):
        tasks.append(GeneratedTask(
            title=t.get("title", "Untitled"),
            description=t.get("description", ""),
            priority=t.get("priority", "MEDIUM"),
            category=t.get("category", ""),
        ))

    return AIGenerateTasksResponse(
        tasks=tasks,
        summary=parsed.get("summary", ""),
    )


@router.post("/refine-tasks", response_model=AIGenerateTasksResponse)
async def refine_tasks(
    data: AIRefineTasksRequest,
    user=Depends(get_current_user),
):
    """Refine previously generated tasks based on user feedback."""
    _check_rate_limit(str(user["_id"]))

    api_key = user.get("gemini_api_key")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="Please set your Gemini API key first."
        )

    tasks_json = json.dumps(
        [t.model_dump() for t in data.tasks], indent=2
    )
    prompt = REFINE_PROMPT.format(
        goal=data.goal,
        tasks_json=tasks_json,
        feedback=data.feedback,
    )
    raw = await _call_gemini(api_key, prompt)
    parsed = _parse_gemini_response(raw)

    tasks = []
    for t in parsed.get("tasks", []):
        tasks.append(GeneratedTask(
            title=t.get("title", "Untitled"),
            description=t.get("description", ""),
            priority=t.get("priority", "MEDIUM"),
            category=t.get("category", ""),
        ))

    return AIGenerateTasksResponse(
        tasks=tasks,
        summary=parsed.get("summary", ""),
    )
