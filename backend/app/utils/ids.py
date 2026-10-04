import secrets

# Crockford-style alphabet without ambiguous characters (0/O, 1/I/L, U)
BS_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
BS_ID_PREFIX = "BS-"
BS_ID_LENGTH = 6


def generate_bs_id() -> str:
    """Generate a short, human-shareable BartaSetu ID such as BS-7K3Q9X."""
    return BS_ID_PREFIX + "".join(secrets.choice(BS_ID_ALPHABET) for _ in range(BS_ID_LENGTH))


def normalize_bs_id(value: str) -> str:
    """Normalize user input: trim, uppercase, and accept IDs typed without the BS- prefix."""
    cleaned = value.strip().upper().replace(" ", "")
    if cleaned.startswith(BS_ID_PREFIX):
        body = cleaned[len(BS_ID_PREFIX):]
    elif cleaned.startswith("BS") and len(cleaned) == 2 + BS_ID_LENGTH:
        body = cleaned[2:]
    else:
        body = cleaned.lstrip("-")
    return BS_ID_PREFIX + body
