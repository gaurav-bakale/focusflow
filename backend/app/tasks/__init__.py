"""
Tasks package — exposes the FastAPI router for registration in main.py.
"""

from app.tasks.router import router

__all__ = ["router"]
