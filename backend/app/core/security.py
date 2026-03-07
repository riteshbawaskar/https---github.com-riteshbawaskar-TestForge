"""Simple reversible encryption for storing GitLab/API tokens.

Uses XOR with a repeated key + base64 encoding.  This is obfuscation, not
strong encryption — it keeps tokens out of plaintext in the DB while keeping
the implementation dependency-free (no cryptography package needed).

For production you can swap _encrypt/_decrypt for Fernet or AWS KMS without
changing any callers.
"""
from __future__ import annotations

import base64


def _key_bytes() -> bytes:
    from app.core.config import settings
    secret = settings.ENCRYPTION_SECRET
    # Ensure we have at least 32 bytes of key material
    key = (secret * 4).encode("utf-8")[:32]
    return key


def encrypt_token(plaintext: str) -> str:
    """XOR-encrypt plaintext and return a base64-encoded string."""
    if not plaintext:
        return ""
    data = plaintext.encode("utf-8")
    key  = _key_bytes()
    xored = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
    return base64.urlsafe_b64encode(xored).decode("ascii")


def decrypt_token(ciphertext: str) -> str:
    """Decode base64 and XOR-decrypt back to plaintext."""
    if not ciphertext:
        return ""
    try:
        xored = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
    except Exception as exc:
        raise ValueError(f"Invalid ciphertext (bad base64): {exc}") from exc
    key = _key_bytes()
    data = bytes(b ^ key[i % len(key)] for i, b in enumerate(xored))
    return data.decode("utf-8")
