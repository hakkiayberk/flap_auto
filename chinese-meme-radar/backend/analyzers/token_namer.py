"""
Token name suggester — rule-based, no AI required.
Takes a Chinese trend title and produces an English meme-coin name + ticker.
"""
import re
import unicodedata
from typing import Optional

# ── Mapping: Chinese keyword → English name parts ────────────────────────────
KEYWORD_MAP: dict[str, tuple[str, str]] = {
    # Keyword: (name_part, ticker_hint)
    "熊猫": ("Panda", "PANDA"),
    "大熊猫": ("Giant Panda", "GPANDA"),
    "龙": ("Dragon", "DRAG"),
    "凤凰": ("Phoenix", "PHNX"),
    "老虎": ("Tiger", "TIGR"),
    "狮子": ("Lion", "LION"),
    "兔": ("Bunny", "BUNNY"),
    "兔子": ("Rabbit", "RBBT"),
    "猫": ("Cat", "CAT"),
    "狗": ("Dog", "DOG"),
    "狐狸": ("Fox", "FOX"),
    "狼": ("Wolf", "WOLF"),
    "熊": ("Bear", "BEAR"),
    "鸭": ("Duck", "DUCK"),
    "鸡": ("Rooster", "ROST"),
    "鹤": ("Crane", "CRAN"),
    "鹰": ("Eagle", "EAGL"),
    "貂": ("Mink", "MINK"),
    "麒麟": ("Kirin", "KIRIN"),
    "玄武": ("BlackTortoise", "XWWU"),
    "白虎": ("WhiteTiger", "WTGR"),
    "朱雀": ("Vermillion Bird", "ZQRD"),
    "青龙": ("Azure Dragon", "QDRAG"),
    "蟾蜍": ("ToadMoon", "TOAD"),
    "金蟾": ("GoldenToad", "GTOAD"),
    "乌龟": ("Turtle", "TRTL"),
    "鲤鱼": ("Koi", "KOI"),
    "金鱼": ("Goldfish", "GOLD"),
    "锦鲤": ("LuckyKoi", "LKOI"),
    "冰墩墩": ("BingDwenDwen", "BNGD"),
    "雪容融": ("ShueyRhonRhon", "SUER"),
    "吉祥物": ("Mascot", "MAST"),
    "萌宠": ("CutePet", "CPET"),
    "网红动物": ("ViralPet", "VPET"),
    "羊驼": ("Alpaca", "ALPA"),
    "草泥马": ("AlpacaMeme", "CNMA"),
    "神兽": ("SacredBeast", "SBST"),
    "瑞兽": ("AuspBeast", "AUSB"),
    "神龙": ("ShenLong", "SHLN"),
    "表情包": ("MemeFace", "MFCE"),
}

# Modifier keywords that add prefixes/suffixes
MODIFIERS: dict[str, str] = {
    "涨": "Moon",
    "暴涨": "Pump",
    "飙升": "Rocket",
    "冲": "Boost",
    "爆": "Blast",
    "上天": "Sky",
    "火了": "Viral",
    "红了": "Hot",
    "全国": "China",
    "第一": "King",
    "网红": "Star",
    "萌": "Cute",
    "可爱": "Kawaii",
}

# Predefined curated token suggestions for common Chinese mascots
CURATED: dict[str, dict] = {
    "熊猫": {
        "name": "Panda King",
        "ticker": "PANDAK",
        "description": "The Chinese Giant Panda — China's most beloved national treasure. Perfect for meme coin with global recognition.",
        "image_prompt": "Cute cartoon Chinese Giant Panda wearing a golden crown, holding BNB coin, chibi meme coin style, circular logo",
        "logo_emoji": "🐼",
    },
    "龙": {
        "name": "Golden Dragon",
        "ticker": "DRAG",
        "description": "The legendary Chinese Dragon — symbol of power, luck, and prosperity. Classic meme potential.",
        "image_prompt": "Baby golden dragon chibi, holding BNB coin, orange gold gradient circular meme coin logo",
        "logo_emoji": "🐉",
    },
    "锦鲤": {
        "name": "Lucky Koi",
        "ticker": "LKOI",
        "description": "Koi fish = luck & wealth in Chinese culture. Weibo 'lucky koi' meme viral trend.",
        "image_prompt": "Cute kawaii koi fish with crypto coins, red and gold circular token logo, sparkles",
        "logo_emoji": "🐟",
    },
    "凤凰": {
        "name": "PhoenixBSC",
        "ticker": "PHNX",
        "description": "The mythical Phoenix rises — rebirth narrative perfect for meme coins.",
        "image_prompt": "Cute chibi phoenix bird with fire wings, golden and red circular meme token logo",
        "logo_emoji": "🦅",
    },
}


def suggest_token(title: str) -> dict:
    """
    Given a Chinese trend title, return a token name suggestion dict.
    """
    # Check curated first
    for kw, curated in CURATED.items():
        if kw in title:
            return {**curated, "source_title": title, "confidence": "high"}

    # Find the best matching animal keyword
    matched_kw: Optional[str] = None
    matched_info: Optional[tuple[str, str]] = None
    for kw, info in KEYWORD_MAP.items():
        if kw in title:
            matched_kw = kw
            matched_info = info
            break

    if not matched_info:
        # Fallback: transliterate/simplify
        slug = _simplify_title(title)
        return {
            "name": slug,
            "ticker": slug[:5].upper(),
            "description": f"Trending Chinese meme: {title}",
            "image_prompt": f"Cute cartoon meme coin logo for '{title}', chibi style, circular badge",
            "logo_emoji": "🌟",
            "source_title": title,
            "confidence": "low",
        }

    name_part, ticker_base = matched_info

    # Look for modifiers
    prefix = ""
    for mod_kw, mod_word in MODIFIERS.items():
        if mod_kw in title:
            prefix = mod_word + " "
            break

    final_name = f"{prefix}{name_part}".strip()
    # Ticker: modifier first letter + base, max 6 chars
    if prefix:
        ticker = (prefix[0].upper() + ticker_base)[:6]
    else:
        ticker = ticker_base

    return {
        "name": final_name,
        "ticker": ticker,
        "description": (
            f"Based on trending Chinese topic: {title}. "
            f"'{matched_kw}' is a beloved Chinese cultural symbol with strong meme potential."
        ),
        "image_prompt": (
            f"Cute cartoon {name_part} mascot, chibi anime style, "
            f"crypto coin meme logo, circular badge, vibrant colors, white background"
        ),
        "logo_emoji": _pick_emoji(matched_kw or ""),
        "source_title": title,
        "confidence": "medium",
    }


def _pick_emoji(kw: str) -> str:
    emoji_map = {
        "熊猫": "🐼", "大熊猫": "🐼", "龙": "🐉", "凤凰": "🦅",
        "老虎": "🐯", "狮子": "🦁", "兔": "🐰", "兔子": "🐰",
        "猫": "🐱", "狗": "🐶", "狐狸": "🦊", "狼": "🐺",
        "熊": "🐻", "鸭": "🦆", "鸡": "🐓", "鹤": "🦩",
        "鹰": "🦅", "麒麟": "🦄", "鲤鱼": "🐟", "锦鲤": "🐠",
        "金蟾": "🐸", "蟾蜍": "🐸", "乌龟": "🐢",
    }
    return emoji_map.get(kw, "🌟")


def _simplify_title(title: str) -> str:
    """Create a simple English-like slug from Chinese title."""
    # Remove non-alphanumeric, keep letters
    ascii_part = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    cleaned = re.sub(r"[^a-zA-Z0-9]", "", ascii_part)
    return cleaned[:8].capitalize() or "ChinaMeme"
