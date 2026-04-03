"""
AI Router - /api/ai

Provides AI-powered productivity features using Google Gemini.
Implements the Strategy Pattern: each AI feature is a separate strategy class.
The GeminiAdapter isolates all SDK communication from business logic.

Rate limiting: 10 AI requests per user per hour (enforced in-memory).

Endpoints:
  POST /breakdown       — decompose a task into subtasks
  POST /prioritize      — rank tasks by urgency/importance
  POST /generate-tasks  — generate tasks from a goal description
  POST /refine-tasks    — refine generated tasks with feedback
  POST /schedule        — suggest a daily schedule for current tasks
  POST /frog            — identify the most important task of the day
  POST /tips            — productivity tips based on task patterns
"""

# ── Design Patterns ───────────────────────────────────────────────────────────
# Adapter    — GeminiAdapter wraps the Google GenAI SDK, isolating all
#              third-party API details from the rest of the codebase.
#
# Strategy   — each AI feature is a subclass of AIStrategy with its own
#              build_prompt() and parse_response(). Adding a new feature
#              means adding a new class — no existing code changes.
#
# Rate Limit — simple in-memory sliding window (10 req/user/hour).
# ─────────────────────────────────────────────────────────────────────────────

import json
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
    AIScheduleRequest,
    AIScheduleBlock,
    AIScheduleResponse,
    AIFrogResponse,
    AITipsResponse,
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
        raise HTTPException(
            status_code=429,
            detail="AI rate limit exceeded. Try again in an hour.",
        )
    timestamps.append(now)
    _rate_limit[user_id] = timestamps


# ── Gemini Adapter (Adapter Pattern) ─────────────────────────────────────────

class GeminiAdapter:
    """
    Adapter class wrapping the Google GenAI client.

    Isolates all third-party API details (key management, model selection,
    request formatting, error handling) from the service layer.
    Only this class communicates with Google Gemini — the rest of the app
    calls call_llm().
    """

    MODEL = "gemini-2.5-flash"

    async def call_llm(self, api_key: str, prompt: str) -> str:
        """
        Send a prompt to the Gemini API and return the response text.

        Args:
            api_key: The user's Gemini API key.
            prompt: The fully constructed prompt string.

        Returns:
            The model's text response.

        Raises:
            HTTPException 400: If no API key is provided.
            HTTPException 429: If Gemini rate limit is exceeded.
            HTTPException 502: If the Gemini API call fails.
        """
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="Please set your Gemini API key first.",
            )

        from google import genai

        client = genai.Client(api_key=api_key)
        try:
            response = client.models.generate_content(
                model=self.MODEL,
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
                status_code=502,
                detail=f"AI service error: {err_str}",
            )


_adapter = GeminiAdapter()


def _get_api_key(user: dict) -> str:
    """Extract the Gemini API key from the user document."""
    key = user.get("gemini_api_key", "")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Please set your Gemini API key first.",
        )
    return key


def _parse_json_response(raw: str) -> dict:
    """Parse a JSON response from Gemini, handling markdown code fences."""
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
            detail="AI returned an invalid response. Please try again.",
        )


# ── Strategy Pattern ──────────────────────────────────────────────────────────

class AIStrategy(ABC):
    """
    Abstract base class for AI feature strategies.

    All AI features share the same scaffolding (adapter call, error handling)
    but differ in how they build the prompt and parse the response.
    New AI features are added as new strategy subclasses — no existing code
    changes.
    """

    @abstractmethod
    def build_prompt(self, data: dict) -> str:
        """Construct the prompt to send to the LLM."""

    @abstractmethod
    def parse_response(self, response: str) -> any:
        """Parse the raw LLM response into structured output."""

    async def execute(self, api_key: str, data: dict) -> any:
        prompt = self.build_prompt(data)
        response = await _adapter.call_llm(api_key, prompt)
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
                cleaned = line.split(". ", 1)[-1].split(") ", 1)[-1].strip()
                if cleaned:
                    subtasks.append(cleaned)
        return subtasks if subtasks else [response]


class PrioritizeStrategy(AIStrategy):
    """
    Strategy for ranking a list of tasks by urgency and importance.

    Prompts the LLM to return tasks ordered from highest to lowest priority.
    """

    def build_prompt(self, data: dict) -> str:
        tasks = data["tasks"]
        task_lines = []
        for t in tasks:
            task_lines.append(
                f"- {t.get('title', 'Untitled')} "
                f"(deadline: {t.get('deadline', 'none')}, "
                f"priority: {t.get('priority', 'MEDIUM')})"
            )
        task_list = "\n".join(task_lines)
        return (
            f"Rank these tasks from highest to lowest priority based on "
            f"urgency and importance:\n"
            f"{task_list}\n\n"
            f"Return ONLY a numbered list of task titles in priority order. "
            f"No extra text."
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


class ScheduleStrategy(AIStrategy):
    """
    Strategy for suggesting a daily time-blocked schedule.

    Considers task priorities, deadlines, and estimated durations to
    build an optimal work plan for the day.
    """

    def build_prompt(self, data: dict) -> str:
        tasks = data["tasks"]
        hours = data.get("available_hours", 8)
        task_lines = []
        for t in tasks:
            task_lines.append(
                f"- {t.get('title', 'Untitled')} "
                f"(priority: {t.get('priority', 'MEDIUM')}, "
                f"deadline: {t.get('deadline', 'none')}, "
                f"estimated: {t.get('estimated_minutes', 30)} min)"
            )
        task_list = "\n".join(task_lines)
        return (
            f"Create a focused daily schedule for these tasks. "
            f"The user has {hours} hours available today.\n\n"
            f"Tasks:\n{task_list}\n\n"
            f"Rules:\n"
            f"- Start at 9:00 AM\n"
            f"- Schedule high-priority tasks in the morning\n"
            f"- Include short breaks between tasks\n"
            f"- Include a lunch break around noon\n\n"
            f"Respond ONLY with valid JSON (no markdown fences):\n"
            f'{{"summary": "One-line overview", "schedule": ['
            f'{{"time": "9:00 AM", "task_title": "...", '
            f'"duration_minutes": 30, "reason": "..."}}]}}'
        )

    def parse_response(self, response: str) -> dict:
        return _parse_json_response(response)


class FrogStrategy(AIStrategy):
    """
    Strategy for identifying the user's 'frog' — the most important
    or challenging task they should tackle first.

    Based on Brian Tracy's "Eat That Frog" productivity method.
    """

    def build_prompt(self, data: dict) -> str:
        tasks = data["tasks"]
        task_lines = []
        for t in tasks:
            task_lines.append(
                f"- \"{t.get('title', 'Untitled')}\" "
                f"(id: {t.get('id', '')}, "
                f"priority: {t.get('priority', 'MEDIUM')}, "
                f"deadline: {t.get('deadline', 'none')}, "
                f"status: {t.get('status', 'TODO')})"
            )
        task_list = "\n".join(task_lines)
        return (
            f"You are a productivity coach using the 'Eat That Frog' method. "
            f"Identify the ONE most important/challenging task the user should "
            f"tackle first today.\n\n"
            f"Tasks:\n{task_list}\n\n"
            f"Consider: urgency (deadline), importance (priority), difficulty, "
            f"and procrastination risk.\n\n"
            f"Respond ONLY with valid JSON (no markdown fences):\n"
            f'{{"task_title": "exact title from the list", '
            f'"task_id": "the id", '
            f'"reason": "2-3 sentence explanation"}}'
        )

    def parse_response(self, response: str) -> dict:
        return _parse_json_response(response)


class TipsStrategy(AIStrategy):
    """
    Strategy for generating personalized productivity tips based on
    the user's task patterns (completion rates, overdue tasks, etc.).
    """

    def build_prompt(self, data: dict) -> str:
        stats = data.get("stats", {})
        return (
            f"You are a productivity coach. Based on these task statistics, "
            f"give 3-5 specific, actionable productivity tips.\n\n"
            f"Stats:\n"
            f"- Total tasks: {stats.get('total', 0)}\n"
            f"- Completed: {stats.get('completed', 0)}\n"
            f"- Overdue: {stats.get('overdue', 0)}\n"
            f"- High priority pending: {stats.get('high_priority_pending', 0)}\n"
            f"- Completion rate: {stats.get('completion_rate', 0)}%\n"
            f"- Most productive day: {stats.get('best_day', 'unknown')}\n\n"
            f"Respond ONLY with valid JSON (no markdown fences):\n"
            f'{{"summary": "One-line assessment", '
            f'"tips": ["tip 1", "tip 2", "tip 3"]}}'
        )

    def parse_response(self, response: str) -> dict:
        return _parse_json_response(response)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/breakdown", response_model=AIBreakdownResponse)
async def breakdown_task(
    data: AIBreakdownRequest,
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Decompose a complex task into 3-6 actionable subtasks.

    Uses BreakdownStrategy to prompt Gemini and parse the numbered list.
    """
    _check_rate_limit(str(user["_id"]))
    api_key = _get_api_key(user)
    strategy = BreakdownStrategy()
    subtasks = await strategy.execute(api_key, {
        "title": data.task_title,
        "description": data.task_description,
    })
    return AIBreakdownResponse(task_id=data.task_id, subtasks=subtasks)


@router.post("/prioritize", response_model=AIPrioritizeResponse)
async def prioritize_tasks(
    data: AIPrioritizeRequest,
    user=Depends(get_current_user),
):
    """
    Rank a list of tasks by urgency and importance using PrioritizeStrategy.
    """
    _check_rate_limit(str(user["_id"]))
    api_key = _get_api_key(user)
    strategy = PrioritizeStrategy()
    ordered_titles = await strategy.execute(api_key, {"tasks": data.tasks})

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


@router.post("/generate-tasks", response_model=AIGenerateTasksResponse)
async def generate_tasks(
    data: AIGenerateTasksRequest,
    user=Depends(get_current_user),
):
    """Generate tasks from a goal description using the user's Gemini API key."""
    _check_rate_limit(str(user["_id"]))
    api_key = _get_api_key(user)

    prompt = GENERATE_PROMPT + data.goal
    raw = await _adapter.call_llm(api_key, prompt)
    parsed = _parse_json_response(raw)

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
    api_key = _get_api_key(user)

    tasks_json = json.dumps(
        [t.model_dump() for t in data.tasks], indent=2
    )
    prompt = REFINE_PROMPT.format(
        goal=data.goal,
        tasks_json=tasks_json,
        feedback=data.feedback,
    )
    raw = await _adapter.call_llm(api_key, prompt)
    parsed = _parse_json_response(raw)

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


# ── Daily Schedule ───────────────────────────────────────────────────────

@router.post("/schedule", response_model=AIScheduleResponse)
async def suggest_schedule(
    data: AIScheduleRequest,
    user=Depends(get_current_user),
):
    """
    Suggest a daily time-blocked schedule based on the user's tasks.

    Uses ScheduleStrategy to build an optimal work plan considering
    priorities, deadlines, and estimated durations.
    """
    _check_rate_limit(str(user["_id"]))
    api_key = _get_api_key(user)
    strategy = ScheduleStrategy()
    parsed = await strategy.execute(api_key, {
        "tasks": data.tasks,
        "available_hours": data.available_hours,
    })

    schedule = []
    for block in parsed.get("schedule", []):
        schedule.append(AIScheduleBlock(
            time=block.get("time", ""),
            task_title=block.get("task_title", ""),
            duration_minutes=block.get("duration_minutes", 30),
            reason=block.get("reason", ""),
        ))

    return AIScheduleResponse(
        schedule=schedule,
        summary=parsed.get("summary", ""),
    )


# ── Frog of the Day ─────────────────────────────────────────────────────

@router.post("/frog", response_model=AIFrogResponse)
async def find_frog(
    data: AIPrioritizeRequest,
    user=Depends(get_current_user),
):
    """
    Identify the user's 'frog' — the single most important or
    challenging task they should tackle first today.

    Based on Brian Tracy's 'Eat That Frog' productivity method.
    """
    _check_rate_limit(str(user["_id"]))
    api_key = _get_api_key(user)
    strategy = FrogStrategy()
    parsed = await strategy.execute(api_key, {"tasks": data.tasks})

    return AIFrogResponse(
        task_title=parsed.get("task_title", ""),
        task_id=parsed.get("task_id"),
        reason=parsed.get("reason", ""),
    )


# ── Productivity Tips ────────────────────────────────────────────────────

@router.post("/tips", response_model=AITipsResponse)
async def get_tips(
    user=Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Generate personalized productivity tips based on the user's
    task completion patterns and statistics.

    Reads task data from MongoDB to compute stats, then sends
    them to the TipsStrategy for AI analysis.
    """
    _check_rate_limit(str(user["_id"]))
    api_key = _get_api_key(user)

    # Compute stats from user's tasks
    tasks_col = db["tasks"]
    all_tasks = []
    cursor = tasks_col.find({"user_id": str(user["_id"])})
    async for t in cursor:
        all_tasks.append(t)

    total = len(all_tasks)
    completed = sum(1 for t in all_tasks if t.get("status") == "DONE")
    overdue = 0
    high_priority_pending = 0
    from datetime import datetime
    today = datetime.utcnow().strftime("%Y-%m-%d")
    for t in all_tasks:
        if t.get("status") != "DONE":
            if t.get("deadline") and t["deadline"] < today:
                overdue += 1
            if t.get("priority") == "HIGH":
                high_priority_pending += 1

    completion_rate = round((completed / total * 100) if total > 0 else 0)

    stats = {
        "total": total,
        "completed": completed,
        "overdue": overdue,
        "high_priority_pending": high_priority_pending,
        "completion_rate": completion_rate,
    }

    strategy = TipsStrategy()
    parsed = await strategy.execute(api_key, {"stats": stats})

    return AITipsResponse(
        tips=parsed.get("tips", []),
        summary=parsed.get("summary", ""),
    )
