import re
from datetime import datetime, timezone
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.redis import get_redis_pool

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
            try:
                redis = get_redis_pool()
                # Track total hits
                await redis.incr(f"stats:crawler:total")
                # Track specific bot hits
                await redis.hincrby("stats:crawler:bots", found_bot, 1)
                # Track last seen
                await redis.hset("stats:crawler:last_seen", found_bot, datetime.now(timezone.utc).isoformat())
            except Exception:
                pass # Don't block request if redis fails
                
        return await call_next(request)
