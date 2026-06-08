import pytest
from app.utils.emergency import check_emergency


def test_detects_suicide():
    assert check_emergency("I'm thinking about suicide") is True


def test_detects_chest_pain():
    assert check_emergency("Patient has chest pain and diaphoresis") is True


def test_detects_anaphylaxis():
    assert check_emergency("Anaphylaxis after penicillin dose") is True


def test_no_emergency_normal_query():
    assert check_emergency("What is the mechanism of metformin?") is False


def test_case_insensitive():
    assert check_emergency("CHEST PAIN radiating to left arm") is True


def test_detects_cant_breathe():
    assert check_emergency("patient can't breathe") is True


def test_detects_overdose():
    assert check_emergency("paracetamol overdose management") is True
