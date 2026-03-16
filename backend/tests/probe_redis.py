"""Probe Redis for data source readiness."""
import redis

r = redis.Redis(host="localhost", port=6379, db=0, decode_responses=True)
symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]

print("=== Market (price + klines) ===")
for s in symbols:
    price = r.get(f"latest_price:{s}")
    kline = r.get(f"klines:{s}:15m")
    p = "OK" if price else "MISS"
    k = "OK" if kline else "MISS"
    print(f"  {s}: price={p}, kline_15m={k}")

print("\n=== Derivatives (CoinGlass + fallback) ===")
for s in symbols:
    cvd = r.get(f"cg_cvd:{s}")
    nf = r.get(f"cg_netflow:{s}")
    ob = r.get(f"cg_orderbook:{s}")
    deriv = r.get(f"derivatives:{s}")
    mp = r.get(f"cg_option_maxpain:{s}")
    hits = []
    if cvd: hits.append("cvd")
    if nf: hits.append("netflow")
    if ob: hits.append("orderbook")
    if deriv: hits.append("deriv_fallback")
    if mp: hits.append("maxpain")
    print(f"  {s}: {hits if hits else 'ALL MISS'}")

print("\n=== OnChain ===")
for s in symbols:
    gn = r.get(f"gn_onchain:{s}")
    cq = r.get(f"cq_onchain:{s}")
    lg = r.get(f"legacy_onchain:{s}")
    oc = r.get(f"onchain:{s}")
    print(f"  {s}: glassnode={'OK' if gn else 'MISS'}, cryptoquant={'OK' if cq else 'MISS'}, legacy={'OK' if lg else 'MISS'}, onchain={'OK' if oc else 'MISS'}")

print("\n=== Macro ===")
fred = r.get("fred_snapshot")
gecko = r.get("gecko_global")
print(f"  fred_snapshot={'OK' if fred else 'MISS'}")
print(f"  gecko_global={'OK' if gecko else 'MISS'}")

print("\n=== Registry Groups ===")
for key in ["dsgroup:exchange_direct_combo", "dsgroup:coinglass_source", "dsgroup:onchain_sources", "dsgroup:coingecko_source", "dsgroup:fred_source"]:
    val = r.get(key)
    if val:
        import json
        data = json.loads(val)
        enabled = data.get("enabled", "?")
        sources = data.get("sources", [])
        src_info = [(s.get("source_id"), s.get("enabled"), s.get("status")) for s in sources]
        print(f"  {key}: enabled={enabled}, sources={src_info}")
    else:
        print(f"  {key}: NOT FOUND")
