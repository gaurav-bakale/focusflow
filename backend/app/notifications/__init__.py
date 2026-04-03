"""
Notifications package — exposes the FastAPI router for registration in main.py.
"""

from app.notifications.router import router

__all__ = ["router"]
