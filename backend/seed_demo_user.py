"""
Seed Demo User

Creates a demo user in MongoDB if not already present.
Run from the backend/ directory:
    python seed_demo_user.py
"""

import asyncio
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

sys.path.insert(0, str(Path(__file__).parent))

from app.db import connect_db, close_db, get_db
from app.auth import hash_password

DEMO_USER = {
    "name": "Demo User",
    "email": "demo@focusflow.app",
    "password": "Demo@1234",
}


async def seed():
    await connect_db()
    db = get_db()

    existing = await db["users"].find_one({"email": DEMO_USER["email"]})
    if existing:
        print(f"[seed] Demo user already exists: {DEMO_USER['email']}")
        await close_db()
        return

    result = await db["users"].insert_one({
        "name": DEMO_USER["name"],
        "email": DEMO_USER["email"],
        "password_hash": hash_password(DEMO_USER["password"]),
    })
    print(f"[seed] Demo user created: {DEMO_USER['email']}  (id={result.inserted_id})")
    print(f"[seed] Login with  email={DEMO_USER['email']}  password={DEMO_USER['password']}")
    await close_db()


if __name__ == "__main__":
    asyncio.run(seed())
