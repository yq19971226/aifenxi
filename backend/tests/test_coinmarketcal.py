"""CoinMarketCal 集成测试脚本

测试内容：
1. API 连接测试
2. 事件采集测试
3. 数据库写入测试
4. Redis 缓存测试
5. CalendarAgent 分析测试

使用方法：
python backend/tests/test_coinmarketcal.py
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from datetime import datetime, timezone

from app.core.config import settings
from app.data.calendar import CoinMarketCalCollector


async def test_api_connection():
    """测试 API 连接"""
    print("\n" + "=" * 60)
    print("测试 1: API 连接测试")
    print("=" * 60)

    if not settings.coinmarketcal_api_key:
        print("❌ COINMARKETCAL_API_KEY 未配置")
        print("请在 .env 文件中添加：COINMARKETCAL_API_KEY=your_key")
        return False

    try:
        collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)

        # 测试获取分类列表
        categories = await collector.fetch_categories()
        print(f"✅ API 连接成功")
        print(f"   可用分类数: {len(categories)}")
        print(f"   分类列表: {[c.get('name') for c in categories[:5]]}")

        return True

    except Exception as exc:
        print(f"❌ API 连接失败: {exc}")
        return False


async def test_fetch_events():
    """测试事件采集"""
    print("\n" + "=" * 60)
    print("测试 2: 事件采集测试")
    print("=" * 60)

    try:
        collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)

        # 测试获取 BTC 未来 30 天事件
        events = await collector.fetch_upcoming_events("BTC", days_ahead=30)

        print(f"✅ 事件采集成功")
        print(f"   币种: BTC")
        print(f"   事件数: {len(events)}")

        if events:
            print(f"\n   前 3 个事件:")
            for i, event in enumerate(events[:3], 1):
                print(f"   {i}. {event.title}")
                print(f"      日期: {event.date_event.strftime('%Y-%m-%d')}")
                print(f"      分类: {', '.join(event.categories)}")
                print(f"      投票数: {event.vote_count}")

        return True

    except Exception as exc:
        print(f"❌ 事件采集失败: {exc}")
        return False


async def test_high_impact_events():
    """测试高影响力事件筛选"""
    print("\n" + "=" * 60)
    print("测试 3: 高影响力事件筛选")
    print("=" * 60)

    try:
        collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)

        # 获取高影响力事件（投票数 > 50）
        events = await collector.fetch_high_impact_events("BTC", days_ahead=30, min_votes=50)

        print(f"✅ 高影响力事件筛选成功")
        print(f"   币种: BTC")
        print(f"   高影响力事件数: {len(events)}")

        if events:
            print(f"\n   高影响力事件列表:")
            for i, event in enumerate(events, 1):
                print(f"   {i}. {event.title}")
                print(f"      投票数: {event.vote_count}")
                print(f"      分类: {', '.join(event.categories)}")

        return True

    except Exception as exc:
        print(f"❌ 高影响力事件筛选失败: {exc}")
        return False


async def test_database_storage():
    """测试数据库写入"""
    print("\n" + "=" * 60)
    print("测试 4: 数据库写入测试")
    print("=" * 60)

    try:
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text

        collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)
        events = await collector.fetch_upcoming_events("BTC", days_ahead=7)

        if not events:
            print("⚠️  未获取到事件，跳过数据库测试")
            return True

        # 写入数据库
        async with AsyncSessionLocal() as session:
            async with session.begin():
                for event in events[:3]:  # 只测试前 3 个
                    await session.execute(
                        text("""
                            INSERT INTO calendar_events (
                                event_id, symbol, title, description,
                                event_date, categories, proof_link, source,
                                vote_count, positive_vote_count, percentage,
                                can_occur_before, created_at
                            )
                            VALUES (
                                :event_id, :symbol, :title, :description,
                                :event_date, :categories, :proof_link, :source,
                                :vote_count, :positive_vote_count, :percentage,
                                :can_occur_before, :created_at
                            )
                            ON CONFLICT (event_id) DO UPDATE
                            SET vote_count = EXCLUDED.vote_count,
                                updated_at = NOW()
                        """),
                        {
                            "event_id": event.event_id,
                            "symbol": "BTC",
                            "title": event.title,
                            "description": event.description,
                            "event_date": event.date_event,
                            "categories": ",".join(event.categories),
                            "proof_link": event.proof,
                            "source": event.source,
                            "vote_count": event.vote_count,
                            "positive_vote_count": event.positive_vote_count,
                            "percentage": event.percentage,
                            "can_occur_before": event.can_occur_before,
                            "created_at": datetime.now(timezone.utc),
                        },
                    )

        print(f"✅ 数据库写入成功")
        print(f"   写入事件数: {min(len(events), 3)}")

        # 验证读取
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT COUNT(*) FROM calendar_events WHERE symbol = 'BTC'")
            )
            count = result.scalar()
            print(f"   数据库中 BTC 事件总数: {count}")

        return True

    except Exception as exc:
        print(f"❌ 数据库写入失败: {exc}")
        import traceback
        traceback.print_exc()
        return False


async def test_redis_cache():
    """测试 Redis 缓存"""
    print("\n" + "=" * 60)
    print("测试 5: Redis 缓存测试")
    print("=" * 60)

    try:
        from app.core.redis import init_redis, get_json, set_with_ttl

        await init_redis()

        collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)
        events = await collector.fetch_upcoming_events("BTC", days_ahead=7)

        if not events:
            print("⚠️  未获取到事件，跳过缓存测试")
            return True

        # 写入缓存
        cache_key = "calendar:BTC"
        data = [
            {
                "event_id": e.event_id,
                "title": e.title,
                "event_date": e.date_event.isoformat(),
                "categories": e.categories,
                "vote_count": e.vote_count,
            }
            for e in events[:5]
        ]

        await set_with_ttl(cache_key, data, ttl_seconds=3600)
        print(f"✅ Redis 缓存写入成功")
        print(f"   缓存键: {cache_key}")
        print(f"   事件数: {len(data)}")

        # 验证读取
        cached = await get_json(cache_key)
        if cached:
            print(f"✅ Redis 缓存读取成功")
            print(f"   读取到 {len(cached)} 个事件")
        else:
            print(f"❌ Redis 缓存读取失败")
            return False

        return True

    except Exception as exc:
        print(f"❌ Redis 缓存测试失败: {exc}")
        return False


async def test_calendar_agent():
    """测试 CalendarAgent 分析"""
    print("\n" + "=" * 60)
    print("测试 6: CalendarAgent 分析测试")
    print("=" * 60)

    try:
        from app.agents.calendar import CalendarAgent
        from app.models.market_data import MarketData

        # 构造测试数据
        market_data = MarketData(
            symbol="BTC",
            current_price=95000.0,
        )

        agent = CalendarAgent()
        report = await agent.analyze(market_data)

        print(f"✅ CalendarAgent 分析成功")
        print(f"   信号: {report.signal}")
        print(f"   置信度: {report.confidence:.2%}")
        print(f"   关键发现:")
        for finding in report.key_findings:
            print(f"   - {finding}")

        if report.raw_data.get("upcoming_events"):
            print(f"\n   即将到来的事件:")
            for event in report.raw_data["upcoming_events"][:3]:
                print(f"   - {event.get('title')} ({event.get('days_to_event')}天后)")

        return True

    except Exception as exc:
        print(f"❌ CalendarAgent 分析失败: {exc}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """运行所有测试"""
    print("\n" + "=" * 60)
    print("CoinMarketCal 集成测试")
    print("=" * 60)

    results = []

    # 运行测试
    results.append(("API 连接", await test_api_connection()))
    results.append(("事件采集", await test_fetch_events()))
    results.append(("高影响力事件", await test_high_impact_events()))
    results.append(("数据库写入", await test_database_storage()))
    results.append(("Redis 缓存", await test_redis_cache()))
    results.append(("CalendarAgent", await test_calendar_agent()))

    # 输出测试结果
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"{name:20s} {status}")

    print(f"\n总计: {passed}/{total} 通过")

    if passed == total:
        print("\n🎉 所有测试通过！CoinMarketCal 集成成功！")
    else:
        print(f"\n⚠️  {total - passed} 个测试失败，请检查配置和日志")


if __name__ == "__main__":
    asyncio.run(main())
