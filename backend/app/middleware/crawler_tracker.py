import re
from datetime import datetime, timezone
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.redis import get_redis_pool
from app.core.i18n_middleware import get_locale_from_request

# 2026 AI Crawler Signatures
AI_CRAWLER_PATTERNS = {
    "OpenAI": r"GPTBot|ChatGPT-User|OAI-SearchBot",
    "Anthropic": r"ClaudeBot",
    "Google": r"Google-Extended|Googlebot",
    "Meta": r"FacebookBot",
    "CommonCrawl": r"CCBot",
    "Perplexity": r"PerplexityBot",
    "Bytespider": r"Bytespider",  # Bytedance/Tiktok
    "Sogou": r"Sogou",
    "YouBot": r"YouBot",
}

class AICrawlerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        ua = request.headers.get("user-agent", "")
        
        found_bot = None
        for bot_name, pattern in AI_CRAWLER_PATTERNS.items():
            if re.search(pattern, ua, re.I):
                found_bot = bot_name
                break
        
        if found_bot:
            # Detect locale
            locale = request.query_params.get("locale")
            if not locale:
                path = request.url.path
                if path.startswith("/zh-CN"): locale = "zh-CN"
                elif path.startswith("/zh-TW"): locale = "zh-TW"
                elif path.startswith("/en"): locale = "en"
            if not locale:
                locale = get_locale_from_request(request)

            try:
                redis = get_redis_pool()
                await redis.incr("stats:crawler:total")
                await redis.hincrby("stats:crawler:bots", found_bot, 1)
                # Track bot + locale breakdown
                await redis.hincrby(f"stats:crawler:locales:{found_bot}", locale, 1)
                await redis.hset("stats:crawler:last_seen", found_bot, datetime.now(timezone.utc).isoformat())
            except Exception:
                pass
                
        return await call_next(request)
