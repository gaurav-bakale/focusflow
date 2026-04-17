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

    # Try models in order. If the primary is overloaded (503/UNAVAILABLE),
    # fall back to a lighter/older sibling before giving up.
    MODEL_FALLBACKS = [
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
    ]
    MODEL = MODEL_FALLBACKS[0]  # legacy attribute, kept for back-compat

    async def call_llm(self, api_key: str, prompt: str) -> str:
        """
        Send a prompt to the Gemini API and return the response text.

        Walks the MODEL_FALLBACKS list on 503/UNAVAILABLE so a momentary
        spike in demand on one model doesn't break the feature.

        Args:
            api_key: The user's Gemini API key.
            prompt: The fully constructed prompt string.

        Returns:
            The model's text response.

        Raises:
            HTTPException 400: If no API key is provided.
            HTTPException 429: If Gemini rate limit is exceeded.
            HTTPException 502: If every fallback model fails.
        """
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="Please set your Gemini API key first.",
            )

        from google import genai

        client = genai.Client(api_key=api_key)
        last_err = None
        for model in self.MODEL_FALLBACKS:
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                )
                return response.text.strip()
            except Exception as e:
                err_str = str(e)
                last_err = err_str
                # Rate-limit is the user's quota — don't bother falling back.
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                    raise HTTPException(
                        status_code=429,
                        detail=(
                            "Gemini API quota exceeded. Please wait a minute "
                            "and try again, or use a different API key."
                        ),
                    )
                # 503 / UNAVAILABLE — model is overloaded, try next fallback.
                if "503" in err_str or "UNAVAILABLE" in err_str or "overload" in err_str.lower():
                    continue
                # Any other error — don't keep burning fallbacks.
                break

        raise HTTPException(
            status_code=502,
            detail=f"AI service error: {last_err}",
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
    Strategy for re-prioritizing a list of tasks by urgency × importance.

    Returns not just an ordering, but also a new HIGH/MEDIUM/LOW classification
    per task along with a one-sentence rationale — so the UI can render a
    meaningful diff panel rather than silently shuffling priorities.
    """

    def build_prompt(self, data: dict) -> str:
        tasks = data["tasks"]
        task_lines = []
        for t in tasks:
            task_lines.append(
                f"- id: {t.get('id','')} | \"{t.get('title','Untitled')}\" "
                f"| current: {t.get('priority','MEDIUM')} "
                f"| deadline: {t.get('deadline','none')} "
                f"| status: {t.get('status','TODO')} "
                f"| desc: {t.get('description','') or '(none)'}"
            )
        task_list = "\n".join(task_lines) or "(none)"
        return (
            "You are a productivity coach re-prioritizing the user's backlog. "
            "For EACH task, assign a new priority (HIGH / MEDIUM / LOW) and an "
            "integer rank (1 = do first). Use urgency × importance — a task due "
            "today or overdue outranks a nominally HIGH task due in two weeks. "
            "Change a priority only if deadline pressure, dependencies, or "
            "blocked work genuinely justify it.\n\n"
            f"TASKS:\n{task_list}\n\n"
            "RULES:\n"
            "1. Rank every task (1..N, unique, no ties).\n"
            "2. Reason must be 1 short sentence (<= 90 chars) and MUST mention "
            "the key signal (e.g. deadline, blocker, dependency, quick win).\n"
            "3. Keep existing priority when no strong reason to change.\n"
            "4. Return every task id from the input — no additions, no drops.\n\n"
            "OUTPUT — respond with ONLY valid JSON, no markdown fences:\n"
            '{\n'
            '  "summary": "1-2 sentence strategic overview — what should dominate today and why",\n'
            '  "ranked": [\n'
            '    {\n'
            '      "id": "<task id>",\n'
            '      "title": "<exact title>",\n'
            '      "rank": 1,\n'
            '      "priority": "HIGH | MEDIUM | LOW",\n'
            '      "reason": "short rationale"\n'
            '    }\n'
            '  ]\n'
            '}'
        )

    def parse_response(self, response: str) -> dict:
        return _parse_json_response(response)


class ScheduleStrategy(AIStrategy):
    """
    Strategy for suggesting a daily time-blocked schedule.

    Considers task priorities, deadlines, and estimated durations to
    build an optimal work plan for the day.
    """

    def build_prompt(self, data: dict) -> str:
        tasks          = data["tasks"]
        hours          = data.get("available_hours", 8)
        current_time   = data.get("current_time") or ""
        existing       = data.get("existing_blocks") or []
        focus_mins     = data.get("focus_minutes", 25)

        task_lines = []
        for t in tasks:
            task_lines.append(
                f"- \"{t.get('title', 'Untitled')}\" "
                f"(priority: {t.get('priority', 'MEDIUM')}, "
                f"deadline: {t.get('deadline', 'none')}, "
                f"estimated: {t.get('estimated_minutes', focus_mins)} min, "
                f"status: {t.get('status', 'TODO')})"
            )
        task_list = "\n".join(task_lines) or "(none)"

        if existing:
            busy_lines = "\n".join(
                f"- {b.get('start_time','')} → {b.get('end_time','')} ({b.get('title','busy')})"
                for b in existing
            )
        else:
            busy_lines = "(none)"

        return (
            "You are an expert cognitive workload planner. Produce an intelligent "
            "time-blocked schedule for today that is NOT a naive sequential list — "
            "you must reason about energy levels, context-switching, and recovery.\n\n"
            f"CURRENT LOCAL TIME: {current_time or 'unknown — assume start of workday'}\n"
            f"HOURS REMAINING TODAY: {hours}\n"
            f"POMODORO UNIT: {focus_mins} minutes (focus work should align to this)\n\n"
            f"TASKS TO SCHEDULE:\n{task_list}\n\n"
            f"ALREADY BUSY (avoid these windows):\n{busy_lines}\n\n"
            "REASONING RULES — apply every single one:\n"
            "1. ENERGY CURVE: cognitive peak is 9–12am (DEEP work), post-lunch dip 1–3pm "
            "(SHALLOW / admin), recovery 3–5pm (MEDIUM). Never schedule a DEEP task during "
            "a dip. Never schedule SHALLOW work during a peak.\n"
            "2. DEADLINE URGENCY WINS: a task due today or overdue outranks a HIGH-priority "
            "task due next week. Combine urgency × priority — don't just sort by priority.\n"
            "3. CONTEXT SWITCHING COST: batch tasks that feel similar (same domain, same "
            "tools). Insert a 5–10 minute BUFFER when switching contexts is unavoidable.\n"
            "4. BREAK PACING: a short BREAK (5–10 min) after every focus pomodoro, a long "
            "BREAK (15–20 min) after 2–3 pomodoros, and one LUNCH block (30–45 min) "
            "between 11:45am and 1:15pm.\n"
            "5. RESPECT EXISTING CALENDAR: never overlap an already-busy window.\n"
            "6. START FROM CURRENT_TIME: do not backfill into the past. Round up to the "
            "next 15-minute boundary.\n"
            "7. DON'T OVER-COMMIT: if tasks exceed available time, schedule the highest-leverage "
            "subset and mention what was deferred in the summary.\n"
            "8. RATIONALE: the reason field must explain WHY this time (energy, batching, "
            "deadline pressure) in 1 short sentence — not restate the task.\n\n"
            "OUTPUT FORMAT — respond ONLY with valid JSON (no markdown fences):\n"
            '{\n'
            '  "summary": "1-2 sentence plan overview — lead with the strategic insight",\n'
            '  "schedule": [\n'
            '    {\n'
            '      "task_title": "exact title from the list, or \'Break\' / \'Lunch\' / \'Buffer\'",\n'
            '      "start_time": "YYYY-MM-DDTHH:MM (local, 24h)",\n'
            '      "end_time":   "YYYY-MM-DDTHH:MM",\n'
            '      "time": "human label, e.g. \'10:30 AM\'",\n'
            '      "duration_minutes": 25,\n'
            '      "block_type": "TASK | BREAK | LUNCH | BUFFER",\n'
            '      "energy":     "DEEP | MEDIUM | SHALLOW | REST",\n'
            '      "reason":     "why this slot — energy/batching/deadline, 1 short sentence"\n'
            '    }\n'
            '  ]\n'
            '}'
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
    db=Depends(get_db),
):
    """
    Re-prioritize a list of tasks by urgency × importance.

    Persists priority changes to the database, and returns a per-task diff
    (old_priority → new_priority, rank, reason) plus a summary so the UI can
    render a meaningful confirmation panel.
    """
    _check_rate_limit(str(user["_id"]))
    api_key = _get_api_key(user)
    strategy = PrioritizeStrategy()
    parsed = await strategy.execute(api_key, {"tasks": data.tasks})

    ranked   = parsed.get("ranked", []) or []
    summary  = parsed.get("summary", "") or ""
    allowed  = {"HIGH", "MEDIUM", "LOW"}

    id_to_input = {t.get("id"): t for t in data.tasks if t.get("id")}
    tasks_col   = db["tasks"]
    user_id_str = str(user["_id"])

    # Sort by AI-returned rank (fallback to input order)
    ranked.sort(key=lambda r: r.get("rank", 9_999))

    changes = []
    prioritized: List[dict] = []
    seen_ids = set()

    for r in ranked:
        tid        = r.get("id")
        if not tid or tid in seen_ids or tid not in id_to_input:
            continue
        seen_ids.add(tid)
        original   = id_to_input[tid]
        old_prio   = original.get("priority", "MEDIUM")
        new_prio   = str(r.get("priority", old_prio)).upper()
        if new_prio not in allowed:
            new_prio = old_prio
        reason     = (r.get("reason") or "").strip()
        rank       = r.get("rank")

        # Persist priority change only when it actually changes.
        if new_prio != old_prio:
            try:
                tasks_col.update_one(
                    {"id": tid, "user_id": user_id_str},
                    {"$set": {"priority": new_prio}},
                )
            except Exception:
                # Persistence is best-effort; still surface the AI decision.
                pass

        changes.append({
            "id": tid,
            "title": original.get("title", ""),
            "old_priority": old_prio,
            "new_priority": new_prio,
            "rank": rank,
            "reason": reason,
            "changed": new_prio != old_prio,
        })
        prioritized.append({**original, "priority": new_prio, "rank": rank})

    # Append any tasks the AI dropped from its output
    for t in data.tasks:
        if t.get("id") and t["id"] not in seen_ids:
            prioritized.append(t)

    return AIPrioritizeResponse(
        prioritized_tasks=prioritized,
        changes=changes,
        summary=summary,
    )


# ── Gemini-powered Task Generation ──────────────────────────────────────

GENERATE_PROMPT = """You are a productivity assistant. The user wants to accomplish a goal.
Break it down into EXACTLY 5 actionable tasks — no more, no less.

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

Update the tasks based on the feedback. Always return EXACTLY 5 tasks — no more, no less.

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
        "tasks":           data.tasks,
        "available_hours": data.available_hours,
        "current_time":    data.current_time,
        "existing_blocks": data.existing_blocks,
        "focus_minutes":   data.focus_minutes,
    })

    schedule = []
    for block in parsed.get("schedule", []):
        schedule.append(AIScheduleBlock(
            time=block.get("time", ""),
            task_title=block.get("task_title", ""),
            duration_minutes=block.get("duration_minutes", 30),
            reason=block.get("reason", ""),
            start_time=block.get("start_time"),
            end_time=block.get("end_time"),
            block_type=block.get("block_type", "TASK"),
            energy=block.get("energy", "MEDIUM"),
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
