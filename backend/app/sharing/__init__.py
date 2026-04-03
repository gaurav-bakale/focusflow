"""
Sharing package — exposes the FastAPI router for registration in main.py.
"""

from app.sharing.router import router

__all__ = ["router"]
