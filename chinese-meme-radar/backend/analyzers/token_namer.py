"""Conservative Chinese name suggestions. Matching a name does not prove virality."""
import re

# Small reviewed alias registry, not an open-ended entity recognizer.
ENTITIES = (
    {"name": None, "aliases": ("binancians",), "pattern": "Community term", "emoji": "👥",
     "reason": "Distinct community term: binancians. Preserve the source spelling; choose a Chinese adaptation in naming review. This is not company endorsement."},
    {"name": "萌兰", "aliases": ("萌兰",), "pattern": "Named animal", "emoji": "🐼",
     "reason": "Preserve the specific panda name rather than replacing it with a generic panda label."},
    {"name": "黑柴", "aliases": ("黑柴", "Black Shiba"), "pattern": "Brand-post character", "emoji": "🐕",
     "reason": "Use the character named in the source. A brand post does not imply endorsement of a token."},
    {"name": "泡菜", "aliases": ("泡菜", "김치", "kimchi"), "pattern": "Cultural reference", "emoji": "🥬",
     "reason": "Preserve the cultural reference and record its original-language alias separately."},
)

# Only produce a low-confidence review candidate for generic keyword matches.
KEYWORDS = (
    "大熊猫", "网红动物", "冰墩墩", "雪容融", "草泥马", "吉祥物", "表情包",
    "熊猫", "凤凰", "老虎", "狮子", "兔子", "狐狸", "麒麟", "玄武", "白虎",
    "朱雀", "青龙", "蟾蜍", "金蟾", "乌龟", "鲤鱼", "金鱼", "锦鲤", "萌宠",
    "羊驼", "神兽", "瑞兽", "神龙", "兔", "猫", "狗", "狼", "熊", "鸭", "鸡", "鹤", "鹰", "貂", "龙",
)


def suggest_token(title: str) -> dict:
    base = {"source_title": title, "virality_verified": False, "launch_eligible": False,
            "review_required": True, "description": "", "image_prompt": ""}
    matches = []
    for entity in ENTITIES:
        for alias in entity["aliases"]:
            # Latin aliases must be complete phrases, not substrings in unrelated words.
            matched = (re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", title, re.IGNORECASE)
                       if alias.isascii() else alias in title)
            if matched:
                matches.append((entity, alias))
                break
    if len(matches) > 1:
        return {**base, "name": None, "ticker": None, "confidence": "none", "pattern": "Ambiguous entities",
                "reason": "Multiple reviewed entities occur in this title. Select the intended subject before naming.",
                "candidates": [entity["name"] or alias for entity, alias in matches], "logo_emoji": "🔎"}
    if matches:
        entity, alias = matches[0]
        return {**base, "name": entity["name"], "ticker": entity["name"], "source_alias": alias,
                "confidence": "medium", "pattern": entity["pattern"], "reason": entity["reason"],
                "logo_emoji": entity["emoji"]}
    keyword = next((word for word in sorted(KEYWORDS, key=len, reverse=True) if word in title), None)
    if keyword:
        return {**base, "name": keyword, "ticker": keyword, "source_alias": keyword,
                "confidence": "low", "pattern": "Keyword hypothesis", "logo_emoji": "🔎",
                "reason": "A broad keyword was matched. Confirm the actual character, image and context before naming."}
    return {**base, "name": None, "ticker": None, "confidence": "none", "pattern": "No verified entity",
            "reason": "No reviewed entity was extracted. Do not invent a generic token name for this title.", "logo_emoji": "🔎"}
