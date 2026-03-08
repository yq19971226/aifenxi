"""快速启动脚本 - CoinMarketCal 集成测试

使用方法：
1. 确保已配置 COINMARKETCAL_API_KEY
2. 运行数据库迁移
3. 执行此脚本

python backend/scripts/quick_start_calendar.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


async def main():
    print("=" * 70)
    print("CoinMarketCal 集成快速启动")
    print("=" * 70)

    # 1. 检查配置
    print("\n[1/5] 检查配置...")
    from app.core.config import settings

    if not settings.coinmarketcal_api_key:
        print("❌ COINMARKETCAL_API_KEY 未配置")
        print("\n请在 .env 文件中添加：")
        print("COINMARKETCAL_API_KEY=your_api_key_here")
        print("\n获取 API Key: https://coinmarketcal.com/en/api")
        return

    print(f"✅ API Key 已配置: {settings.coinmarketcal_api_key[:10]}...")

    # 2. 测试 API 连接
    print("\n[2/5] 测试 API 连接...")
    from app.data.calendar import CoinMarketCalCollector

    try:
        collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)
        categories = await collector.fetch_categories()
        print(f"✅ API 连接成功，可用分类: {len(categories)} 个")
    except Exception as exc:
        print(f"❌ API 连接失败: {exc}")
        return

    # 3. 检查数据库表
    print("\n[3/5] 检查数据库表...")
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'calendar_events'")
            )
            exists = result.scalar() > 0

            if not exists:
                print("⚠️  calendar_events 表不存在")
                print("\n请运行数据库迁移：")
                print("psql -U omnimind -d omnimind -f backend/migrations/v10_calendar_events.sql")
                return

            print("✅ calendar_events 表已存在")
    except Exception as exc:
        print(f"❌ 数据库检查失败: {exc}")
        return

    # 4. 采集测试数据
    print("\n[4/5] 采集测试数据（BTC 未来 7 天）...")
    try:
        events = await collector.fetch_upcoming_events("BTC", days_ahead=7)
        print(f"✅ 采集成功: {len(events)} 个事件")

        if events:
            print("\n前 3 个事件:")
            for i, event in enumerate(events[:3], 1):
                print(f"  {i}. {event.title}")
                print(f"     日期: {event.date_event.strftime('%Y-%m-%d')}")
                print(f"     分类: {', '.join(event.categories)}")
                print(f"     投票: {event.vote_count}")
    except Exception as exc:
        print(f"❌ 采集失败: {exc}")
        return

    # 5. 测试 CalendarAgent
    print("\n[5/5] 测试 CalendarAgent 分析...")
    from app.agents.calendar import CalendarAgent
    from app.models.market_data import MarketData

    try:
        market_data = MarketData(symbol="BTC", current_price=95000.0)
        agent = CalendarAgent()
        report = await agent.analyze(market_data)

        print(f"✅ 分析成功")
        print(f"   信号: {report.signal}")
        print(f"   置信度: {report.confidence:.2%}")
        print(f"   关键发现:")
        for finding in report.key_findings[:3]:
            print(f"   - {finding}")
    except Exception as exc:
        print(f"❌ 分析失败: {exc}")
        import traceback
        traceback.print_exc()
        return

    # 完成
    print("\n" + "=" * 70)
    print("🎉 CoinMarketCal 集成测试通过！")
    print("=" * 70)
    print("\n下一步:")
    print("1. 启动 Celery Worker: celery -A workers.celery_app worker --loglevel=info")
    print("2. 启动 Celery Beat: celery -A workers.celery_app beat --loglevel=info")
    print("3. 查看定时任务日志: docker-compose logs -f worker | grep calendar")
    print("\n完整文档: docs/coinmarketcal-integration.md")


if __name__ == "__main__":
    asyncio.run(main())
