import asyncio
from app.core.redis import init_redis, get_redis_pool, get_json

async def check():
    await init_redis()
    r = get_redis_pool()
    for sym in ["ETHUSDT", "BTCUSDT"]:
        for itv in ["5m", "15m", "1h", "4h", "1d", "1w"]:
            key = f"klines:{sym}:{itv}"
            data = await get_json(key)
            count = len(data) if data and isinstance(data, list) else 0
            print(f"{key}: {count} bars")
        for itv in ["5m", "15m", "1h", "4h", "1d", "1w"]:
            ind_key = f"indicators:{sym}:{itv}"
            ind = await get_json(ind_key)
            status = "EXISTS" if ind else "MISSING"
            print(f"{ind_key}: {status}")
        price = await r.get(f"latest_price:{sym}")
        print(f"latest_price:{sym}: {price}")
        print()

asyncio.run(check())
