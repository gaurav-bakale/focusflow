"""
Backward-compatibility shim.

Task routes have moved to app.tasks (self-contained package).
This file re-exports the router so any stale import paths continue to work.
New code should import from app.tasks.router directly.
"""

from app.tasks.router import router  # noqa: F401
