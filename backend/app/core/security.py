"""Fernet (AES-128-CBC + HMAC-SHA256) encryption for storing GitLab/API tokens.

Tokens encrypted with the previous XOR scheme are transparently decrypted on
first read via the legacy fallback; new writes always use Fernet.

Requires: cryptography>=41.0 (added to requirements.txt)
"""
from __future__ import annotations

import base64
import hashlib


def _fernet():
    """Return a Fernet instance keyed from ENCRYPTION_SECRET."""
    from cryptography.fernet import Fernet
    from app.core.config import settings
    key_bytes = hashlib.sha256(settings.ENCRYPTION_SECRET.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key_bytes))


def _xor_decrypt_legacy(ciphertext: str) -> str:
    """Decrypt tokens stored by the old XOR scheme (backward compatibility)."""
    from app.core.config import settings
    key = (settings.ENCRYPTION_SECRET * 4).encode("utf-8")[:32]
    xored = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(xored)).decode("utf-8")


def encrypt_token(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except Exception:
        # Fallback: try legacy XOR scheme for tokens stored before the Fernet upgrade
        try:
            return _xor_decrypt_legacy(ciphertext)
        except Exception as exc:
            raise ValueError(f"Failed to decrypt token: {exc}") from exc
