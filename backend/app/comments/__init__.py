"""
Comments package — exposes the FastAPI router for registration in main.py.
"""

from app.comments.router import router

__all__ = ["router"]
