"""
Workspaces package — exposes the FastAPI router for registration in main.py.
"""

from app.workspaces.router import router

__all__ = ["router"]
