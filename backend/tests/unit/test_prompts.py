import pytest
from app.core.llm.prompts import get_system_prompt, build_user_prompt, DEFAULT_PROMPT


def test_all_roles_have_prompts():
    roles = ["student_med", "student_nurse", "student_midwifery", "pro_senior", "pro_junior", "pro_nurse", "educator", "admin"]
    for role in roles:
        assert get_system_prompt(role), f"Missing prompt for role: {role}"


def test_sub_role_returns_specific_prompt():
    prompt = get_system_prompt("student_med", "Cardiology")
    assert "cardiology" in prompt.lower() or "cardiac" in prompt.lower() or "ECG" in prompt


def test_student_prompt_no_clinical_directives():
    prompt = get_system_prompt("student_med")
    assert "prescribe" not in prompt.lower() or "never say" in prompt.lower()


def test_unknown_role_falls_back_to_student():
    prompt = get_system_prompt("unknown_role_xyz")
    assert prompt == DEFAULT_PROMPT


def test_build_user_prompt_includes_query():
    result = build_user_prompt("What is metformin?", "context here")
    assert "What is metformin?" in result
    assert "context here" in result


def test_build_user_prompt_requires_citation():
    result = build_user_prompt("test query", "context")
    assert "cite" in result.lower() or "citation" in result.lower()
