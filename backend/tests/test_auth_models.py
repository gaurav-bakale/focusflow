"""
Pure unit tests for authentication Pydantic models.

No database, no HTTP — just model validation.  These run in milliseconds
because they exercise only Python/Pydantic logic.

Covers:
  - UserRegister  : password strength validator (all four rules)
  - OnboardingPreferences : ge / le field range constraints
  - UserLogin     : no strength check on login password
"""

import pytest
from pydantic import ValidationError

from app.authentication.models import OnboardingPreferences, UserLogin, UserRegister


# ── UserRegister — password validator ────────────────────────────────────────

class TestUserRegisterPasswordValidator:
    """Tests for the password_strength field_validator on UserRegister."""

    def test_valid_strong_password_is_accepted(self):
        """A password satisfying all four rules should parse without error."""
        user = UserRegister(
            name="Alice Example",
            email="alice@example.com",
            password="SecurePass1!",
        )
        assert user.password == "SecurePass1!"

    def test_valid_password_with_various_specials_accepted(self):
        """Different special characters should all be accepted."""
        for special in ["!", "@", "#", "$", "%", "^", "&", "*"]:
            user = UserRegister(
                name="Test User",
                email="test@example.com",
                password=f"ValidPass1{special}",
            )
            assert user.password == f"ValidPass1{special}"

    # ── Rule: at least 8 characters ──────────────────────────────────────────

    def test_password_too_short_raises_validation_error(self):
        """Password under 8 characters must be rejected at the Field level."""
        with pytest.raises(ValidationError):
            UserRegister(
                name="Bob Short",
                email="bob@example.com",
                password="Ab1!",  # only 4 chars
            )

    def test_password_exactly_7_chars_raises_validation_error(self):
        """7-char password (one under minimum) must fail."""
        with pytest.raises(ValidationError):
            UserRegister(
                name="Bob Short",
                email="bob@example.com",
                password="Aa1!xxx",  # 7 chars
            )

    def test_password_exactly_8_chars_valid_is_accepted(self):
        """8-char password that satisfies all other rules is the boundary — must pass."""
        user = UserRegister(
            name="Boundary User",
            email="boundary@example.com",
            password="Abcde1!x",  # exactly 8 chars
        )
        assert len(user.password) == 8

    # ── Rule: one uppercase letter ────────────────────────────────────────────

    def test_password_no_uppercase_raises_validation_error(self):
        """Password with no uppercase letter must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                name="Carol Lower",
                email="carol@example.com",
                password="lowercase1!",
            )
        # Validator error message must name the violated rule
        assert "uppercase" in str(exc_info.value).lower()

    def test_error_message_mentions_uppercase_rule(self):
        """ValidationError detail should specify 'uppercase letter' requirement."""
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                name="No Upper",
                email="noupper@example.com",
                password="nouppercase1!",
            )
        errors = exc_info.value.errors()
        # At least one error message should mention the rule
        messages = " ".join(e.get("msg", "") for e in errors).lower()
        assert "uppercase" in messages

    # ── Rule: one number ─────────────────────────────────────────────────────

    def test_password_no_number_raises_validation_error(self):
        """Password with no digit must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                name="Dave Nonum",
                email="dave@example.com",
                password="NoNumberHere!",
            )
        assert "number" in str(exc_info.value).lower()

    def test_error_message_mentions_number_rule(self):
        """ValidationError detail should specify the 'one number' requirement."""
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                name="No Digit",
                email="nodigit@example.com",
                password="NoDigitPass!",
            )
        errors = exc_info.value.errors()
        messages = " ".join(e.get("msg", "") for e in errors).lower()
        assert "number" in messages

    # ── Rule: one special character ───────────────────────────────────────────

    def test_password_no_special_char_raises_validation_error(self):
        """Password with only alphanumeric chars must be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                name="Eve Nospec",
                email="eve@example.com",
                password="NoSpecial1",
            )
        assert "special" in str(exc_info.value).lower()

    def test_error_message_mentions_special_character_rule(self):
        """ValidationError detail should mention 'special character'."""
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                name="No Special",
                email="nospecial@example.com",
                password="AlphaNum1Only",
            )
        errors = exc_info.value.errors()
        messages = " ".join(e.get("msg", "") for e in errors).lower()
        assert "special" in messages

    # ── Multiple rules violated simultaneously ────────────────────────────────

    def test_password_violating_all_rules_error_lists_them_all(self):
        """
        A password that violates multiple rules should list all of them in
        the error message (the validator collects errors before raising).
        """
        # 'short' violates: length (Field-level), no uppercase, no number, no special
        # Use a password that is ≥8 chars to get past the Field min_length and
        # land inside the validator where all four checks run.
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                name="Fail All",
                email="failall@example.com",
                password="alllower",  # 8 chars, no upper, no number, no special
            )
        error_text = str(exc_info.value).lower()
        assert "uppercase" in error_text
        assert "number" in error_text
        assert "special" in error_text

    # ── Other field validations ───────────────────────────────────────────────

    def test_name_too_short_raises_validation_error(self):
        """Name shorter than 2 characters must fail."""
        with pytest.raises(ValidationError):
            UserRegister(
                name="A",
                email="shortname@example.com",
                password="ValidPass1!",
            )

    def test_invalid_email_format_raises_validation_error(self):
        """Non-email string for the email field must fail."""
        with pytest.raises(ValidationError):
            UserRegister(
                name="Bad Email",
                email="not-an-email",
                password="ValidPass1!",
            )


# ── OnboardingPreferences — field range constraints ───────────────────────────

class TestOnboardingPreferencesFieldRanges:
    """Tests for ge / le (min / max) constraints on OnboardingPreferences fields."""

    def test_default_values_are_valid(self):
        """Default construction should produce a valid model."""
        prefs = OnboardingPreferences()
        assert prefs.pomodoro_duration == 25
        assert prefs.short_break == 5
        assert prefs.long_break == 15
        assert prefs.timezone == "UTC"
        assert prefs.theme == "light"

    def test_custom_valid_values_are_accepted(self):
        """Explicitly set values within range must be accepted."""
        prefs = OnboardingPreferences(
            pomodoro_duration=30,
            short_break=10,
            long_break=20,
            timezone="America/New_York",
            theme="dark",
        )
        assert prefs.pomodoro_duration == 30
        assert prefs.short_break == 10
        assert prefs.long_break == 20

    # ── pomodoro_duration: ge=5, le=60 ───────────────────────────────────────

    def test_pomodoro_duration_minimum_boundary(self):
        prefs = OnboardingPreferences(pomodoro_duration=5)
        assert prefs.pomodoro_duration == 5

    def test_pomodoro_duration_maximum_boundary(self):
        prefs = OnboardingPreferences(pomodoro_duration=60)
        assert prefs.pomodoro_duration == 60

    def test_pomodoro_duration_below_minimum_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(pomodoro_duration=4)

    def test_pomodoro_duration_above_maximum_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(pomodoro_duration=61)

    # ── short_break: ge=1, le=30 ─────────────────────────────────────────────

    def test_short_break_minimum_boundary(self):
        prefs = OnboardingPreferences(short_break=1)
        assert prefs.short_break == 1

    def test_short_break_maximum_boundary(self):
        prefs = OnboardingPreferences(short_break=30)
        assert prefs.short_break == 30

    def test_short_break_below_minimum_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(short_break=0)

    def test_short_break_above_maximum_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(short_break=31)

    # ── long_break: ge=5, le=60 ──────────────────────────────────────────────

    def test_long_break_minimum_boundary(self):
        prefs = OnboardingPreferences(long_break=5)
        assert prefs.long_break == 5

    def test_long_break_maximum_boundary(self):
        prefs = OnboardingPreferences(long_break=60)
        assert prefs.long_break == 60

    def test_long_break_below_minimum_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(long_break=4)

    def test_long_break_above_maximum_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(long_break=61)

    # ── theme: pattern="^(light|dark)$" ──────────────────────────────────────

    def test_theme_light_is_valid(self):
        prefs = OnboardingPreferences(theme="light")
        assert prefs.theme == "light"

    def test_theme_dark_is_valid(self):
        prefs = OnboardingPreferences(theme="dark")
        assert prefs.theme == "dark"

    def test_theme_invalid_value_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(theme="blue")

    def test_theme_empty_string_raises(self):
        with pytest.raises(ValidationError):
            OnboardingPreferences(theme="")


# ── UserLogin — no password strength check ────────────────────────────────────

class TestUserLoginNoStrengthCheck:
    """UserLogin must accept any non-empty password string — no strength rule."""

    def test_login_accepts_weak_password_string(self):
        """Login model must not validate password strength — any string is OK."""
        login = UserLogin(email="user@example.com", password="abc")
        assert login.password == "abc"

    def test_login_accepts_short_password(self):
        """Even a 1-character password is valid for login (strength is not checked)."""
        login = UserLogin(email="user@example.com", password="x")
        assert login.password == "x"

    def test_login_accepts_password_with_no_uppercase(self):
        login = UserLogin(email="user@example.com", password="alllowercase")
        assert login.password == "alllowercase"

    def test_login_accepts_password_with_no_number(self):
        login = UserLogin(email="user@example.com", password="NoNumberHere!")
        assert login.password == "NoNumberHere!"

    def test_login_accepts_password_with_no_special_char(self):
        login = UserLogin(email="user@example.com", password="AlphaNum1Only")
        assert login.password == "AlphaNum1Only"

    def test_login_accepts_strong_password_too(self):
        """A strong password must also be accepted (regression guard)."""
        login = UserLogin(email="user@example.com", password="StrongPass1!")
        assert login.password == "StrongPass1!"

    def test_login_invalid_email_still_rejected(self):
        """Even though password is unchecked, email format is still validated."""
        with pytest.raises(ValidationError):
            UserLogin(email="not-an-email", password="anypassword")
