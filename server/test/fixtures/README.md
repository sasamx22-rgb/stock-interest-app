# Naver response fixtures

Captured by read-only HTTP GET on 2026-09-22 around 22:42 UTC (2026-09-23 KST).
These are selected rows/fields from actual responses, not invented contracts.

- KR ranking: https://stock.naver.com/api/domestic/market/stock/default?tradeType=KRX&marketType=ALL&orderType=upperQuantTop&startIdx=0&pageSize=100
- US ranking: https://stock.naver.com/api/foreign/market/stock/global?nation=usa&tradeType=ALL&orderType=up&startIdx=0&pageSize=100
- KR history: https://stock.naver.com/api/stockSecurity/items/v2/domestic/303810/daily-prices?size=30
- US history: https://stock.naver.com/api/securityService/stock/NVDA.O/price?page=1&pageSize=30

Both full ranking captures contained 100 entries. Against source 6531590, US normalization returned zero entries; KR entries lost tradeVolume. Both daily history captures normalized to zero rows. Fixtures retain the field names responsible for those failures.

Neither ranking sample supplies a verified trade timestamp or the ratio aliases used by the parser. The US history sample contains prices but no trading volume. Do not invent timestamps, assume ratio units, or use these fixtures as proof of complete market coverage.

Pagination probes: startIdx=100/pageSize=100 returned empty for both captured endpoints. startIdx=20/pageSize=20 returned empty for KR and 20 entries for US. This is a point-in-time observation, not a pagination guarantee.
