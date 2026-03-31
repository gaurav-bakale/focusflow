#!/bin/bash

# Simplified script to create 25 GitHub issues for FocusFlow project
# Labels will be added manually after creation

REPO="gaurav-bakale/focusflow"

echo "Creating GitHub issues for FocusFlow..."

# Test with one issue first
gh issue create \
  --repo "$REPO" \
  --title "Add Comprehensive Test Coverage for Backend" \
  --body "Only 3 tests exist in \`test_api.py\` (register, duplicate email, create task). Need tests for:
- Task update/delete endpoints
- Timer endpoints
- Calendar endpoints
- AI endpoints
- Error cases and edge conditions

**Current Coverage:** ~15%
**Target Coverage:** 80%+

**TODO Comment:** Line 128 in \`tests/backend/test_api.py\` indicates Sprint 3 expansion needed.

**Files to Test:**
- \`backend/app/routers/tasks.py\`
- \`backend/app/routers/timer.py\`
- \`backend/app/routers/calendar.py\`
- \`backend/app/routers/ai.py\`

**Labels:** backend, testing, in-progress"

echo "Test issue created. Check if it appears in your repository."
