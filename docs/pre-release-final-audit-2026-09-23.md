# 최종 독립 코드 감사 — 2026-09-23 KST

## 감사 기준과 판정

대상: `sasamx22-rgb/stock-interest-app`, `chatgpt/live-naver-market-data`, **65315906db8a2797cdef79cccc465092a6e93106**. 아래 줄 번호는 모두 이 SHA의 수정 전 소스 기준이다. PR의 변경 후 줄 번호와 혼동하지 않는다. 기존 두 보고서는 독립 소스 검토 후 비교 대상으로 읽었으며, 완료 표시나 과거 테스트 결과를 증거로 사용하지 않았다.

**판정: 현재 원본은 출시 보류. 이번 수정만으로도 전체시장 급등 알림의 정상 작동을 보증할 수 없다.** 특히 실응답에서 미국 순위 100개가 모두 탈락했고, 양국 가격 이력도 비어 버렸다. 따라서 기존 Round2의 개인 베타 가능 판정을 그대로 유지할 수 없다. 전체시장 공급 범위, 거래량의 의미와 세션, 장애와 빈 결과 구분을 해결하거나 명시적으로 범위를 축소하는 결정이 필요하다. 범위 축소는 이번 PR에서 임의로 하지 않았다.

확정 Critical은 발견하지 않았다. High 6건, Medium 12건, Low 3건을 아래에 기록했다. '확정'은 코드/실응답/로컬 테스트로 증명한 동작이며, 실제 Railway 장애 발생이나 실기기 전달 성공을 뜻하지 않는다. 구성 조건에 따라 발생하는 문제와 외부 검증 항목은 구분했다.

## High

### H1. publisher key 누락·동일값 구성에서 앱 키가 게시 권한까지 획득

- 위치: `server/src/config.mjs:27`, `server/src/server.mjs:29–34,88–110`; `scripts/publish-report.mjs`의 키 선택부.
- 상태: **확정, 이번 PR 수정**. publish key가 app key로 fallback하고 production은 경고만 했다. 업로드 스크립트도 app key fallback을 허용했다.
- 재현: production에 APP key만 넣어 시작 → 같은 키로 `POST /api/reports`, PDF POST, 보고서 DELETE, 일정 POST 가능. 두 키를 명시적으로 같은 값으로 설정해도 동일하다.
- 영향: APK에서 얻은 앱 키로 보고서와 PDF를 바꾸거나 삭제할 수 있다. 서로 다른 키를 실제로 설정한 구성에서는 이 문제가 발생하지 않는다.
- 수정: publisher fallback 제거, production에서 publisher 누락/동일값이면 시작 실패, 게시 스크립트에도 publisher 필수. 개발에서 app auth만 켠 경우 publisher 작업은 503으로 차단한다.
- 출시 차단: **예**. 수정 병합뿐 아니라 Railway에 서로 다른 두 키를 설정해야 한다. 이번 테스트는 역할 분리 및 잘못된 production 구성 거부를 검증한다.

### H2. 실제 네이버 응답과 quote/history parser 필드 불일치

- 위치: `server/src/naver-provider.mjs:54–62,124–130,135–179,226–273,400–414`.
- 상태: **실응답으로 확정, 필드·날짜 처리 수정**. fixture 출처는 `server/test/fixtures/README.md`.
- 재현: 2026-09-22 22:42 UTC 무렵 수집한 미국 ranking 100개를 원본 `normalizeRankingPayload`에 넣으면 0개. `koreanCodeName/englishCodeName` 누락 때문이다. 한국 ranking의 `tradeVolume`은 0으로 변환된다. 한국 history의 `tradingDateKst/closingPrice`, 미국 history의 `localTradedAt`을 읽지 않아 둘 다 빈 이력으로 변환된다.
- 영향: 미국 급등 목록과 알림 후보 누락, 한국 거래량 0 표시, 가격 이력·거래량 보정 실패. 기존 합성 fixture 테스트는 통과해도 실서비스가 실패한다.
- 수정: 관찰된 필드 추가, 날짜를 검증된 YYYY-MM-DD로 정규화한 뒤 날짜 중복 제거·최신순 정렬. 존재하지 않는 달/일도 거부. 캡처한 대표 행으로 회귀 테스트 추가.
- 출시 차단: **예**. 이 수정은 파싱만 복구한다. H3의 세션/거래량 문제까지 해결한 것으로 표시하면 안 된다.

### H3. 거래량 배수의 단위·분모·현재 세션을 신뢰할 수 없음

- 위치: `server/src/naver-provider.mjs:110–130,169–176,417–462`; `server/src/alerts.mjs:6–7`.
- 상태: **세션 조작과 기본값 문제는 확정; ratio alias 단위는 외부 미검증**. 이번 PR은 timestamp 생성 및 날짜 비교만 수정했다.
- 원인: timestamp가 없으면 조회 시각을 거래 시각으로 생성했다. 원본은 compact/slash 날짜 비교도 일관되지 않았다. 기본 quote는 배수 누락을 1, ranking은 0, 등락률 누락은 0으로 만든다. `Math.max(원본 ratio, 현재누적량/과거평균)`은 서로 다른 정의의 값을 섞는다. 현재 장중 누적량/과거 종일 평균은 같은 시각 대비 거래량 증가가 아니다.
- 재현: timestamp 없는 전일 거래량을 오늘 history와 함께 입력하면 오늘 세션으로 비교한다. 최신 ranking 캡처 양쪽에 검증 가능한 거래 timestamp가 없었다. 미국 NVDA history 캡처에는 volume 자체가 없었다. 이 샘플에서 보정은 성립하지 않는다.
- 단위 증거: 한국 응답의 `quantDiffRate=19901.594`, `tradeVolume=14286739`, `prevQuant=71428`은 `(현재/전일−1)*100`과 수치상 일치한다. **이는 quantDiffRate에 대한 관찰·산술 추론일 뿐**, 코드가 읽는 `volumeRatio/quantRate/volumeIncreaseRate/compareToPreviousTradingVolumeRatio`의 계약을 증명하지 않는다. 이 alias들은 캡처 ranking에 없었다. 일괄 `/100` 변환은 하지 않았다.
- 영향: 알림 누락/오탐, 장중 3배 의미 오해, 오래된 값을 최신 시세처럼 표시. 현재 PR은 timestamp 없는 값을 빈 값으로 유지하므로 해당 보정을 건너뛴다. 더 안전하지만 알림 기능 복구와 같지 않다.
- 수정: 공급자별 명시적 단위·분모·세션 계약, unknown 표시, 세션이 검증된 누적량과 기준량 확보. 장중 동시간 비교인지 종일 평균 비교인지 결정하고 명시. missing/invalid change를 실제 0으로 숨기지 않는다.
- 출시 차단: **급등 알림을 정상 기능으로 제공하려면 예**. 실응답 없는 alias의 단위를 확정 버그로 단정하지 않는다.

### H4. 전체시장 감시가 아닌 제한된 ranking 후보 감시

- 위치: `server/src/config.mjs:6–9` ranking URL 설정, `server/src/server.mjs:174–183`, `server/src/naver-provider.mjs:417–429,507–519`.
- 상태: **확정, 요구사항 결정 필요; 미수정**.
- 재현: 각 시장 URL은 `startIdx=0&pageSize=100`; 101번째 후보는 조회하지 않는다. 상승률은 충족하지만 ratio 보정이 필요한 21번째 종목도 이력 조회에서 제외된다. KR/US 합친 배열의 앞쪽이 보정 예산을 먼저 차지할 수 있다.
- 실응답 pagination: startIdx100/size100은 양쪽 모두 빈 배열. startIdx20/size20은 KR 빈 배열, US 20개였다. 따라서 offset만 늘리면 전 종목을 안전하게 가져온다는 결론은 성립하지 않는다. 거래소 전체 종목 수와 종료 조건, 정렬 이동에 따른 중복/누락 계약도 없다.
- 영향: 조건을 만족하는 종목이 감시되지 않으며, 사용자에게 '전체시장'이라고 표현하면 기능 범위를 과장한다.
- 수정안: 허가된 universe 목록과 명시적 pagination/stream 공급 계약, 종목 ID 중복 제거, 순회 체크포인트, 중앙 요청 제한·backoff·시장 세션 스케줄러를 설계한다. 총 N종목/갱신주기 T의 요청률을 먼저 산정하고 공급자 한도 내에서 배치 처리한다. 현 구조의 표기는 '네이버 순위 후보 기반 감시'가 정확하다. 공급자/요구사항 변경은 이번 PR에서 하지 않았다.
- 출시 차단: **원래 전체시장 요구사항 기준 예**. 후보 한정 베타 수용 여부는 별도 결정이다.

### H5. 서버가 시세·일정 장애를 정상 빈 결과로 반환

- 위치: `server/src/naver-provider.mjs:149–179,382–388,485–503`; `server/src/economic-calendar-provider.mjs:225–285`; `server/src/server.mjs:196–204`; 홈 `mobile/src/app/(tabs)/index.tsx:63–78,118`.
- 상태: **코드상 확정, 미수정**.
- 재현: 관심종목 quote 요청 전부 reject → provider가 `[]` 반환. ranking에 `{error:...}` 또는 변경된 schema를 200으로 반환 → `[]` 캐시. Nasdaq 요청 실패 → 빈 배열로 합치고 성공 캐시. 수동 일정 파일 읽기 오류도 `catch(() => [])`. 상세 가격 이력/뉴스 실패도 각각 빈 목록.
- 영향: 종목·일정이 실제로 없는 경우와 공급 장애 구분 불가. 일부 장애에서 홈은 200/LIVE로 보인다. 감시 후보가 일시적으로 비었다가 복구되면 이전 eligible 집합이 초기화되어 재알림 가능하다. 금융 모니터링에서 조용한 누락은 중요하다.
- 수정: 정상 빈 응답과 스키마 오류를 구분하고 `status/stale/failedSymbols` 등 부분 실패를 전달한다. 마지막 성공값은 stale로 표시하고 전부 실패면 502/명시적 degraded 응답. 오류를 성공 캐시에 저장하지 않는다. API 상태 계약과 화면별 반영을 함께 해야 하므로 이번 작은 수정 PR에는 포함하지 않았다.
- 출시 차단: **예**, 적어도 전체 실패가 정상·빈 결과로 표시되는 경로는 제거해야 한다.

### H6. 보고서 보관함이 무관한 네이버 조회 실패로 닫힘

- 위치: `mobile/src/app/(tabs)/reports.tsx:16–31,43–54`; `server/src/server.mjs:325–334`.
- 상태: **코드상 확정, 미수정; 오류 전파 보강 후 남은 회귀**.
- 재현: 보고서 API는 200, ranking API는 timeout/500. 보관함의 `Promise.all(getReports(), getEngagementSummary())` 중 후자가 reject한다. summary가 movers와 today-focus를 추가로 조회하기 때문이다.
- 영향: Volume에 정상 저장된 보고서도 목록에서 볼 수 없다. 보고서 저장 손상과는 다른 가용성 문제다.
- 수정: 보고서 목록과 읽음 통계 요청을 독립 처리하고 통계 실패는 읽음 상태 확인 실패로만 표시하거나, 읽음 전용 endpoint를 시장 데이터 조회에서 분리한다. 저장된 보고서 접근을 필수 상위 요구사항으로 유지한다.
- 출시 차단: **보고서 라이브러리 기능 기준 예**. UI 디자인 변경 없이 요청 의존성을 끊을 수 있다.

## Medium

### M1. X-Forwarded-For로 rate limit 우회 및 Map 증가

- 위치: `server/src/server.mjs:113–136`.
- 상태: **직접 서버 요청으로 확정, 이번 PR 수정**. Railway가 해당 header를 어떻게 덮어쓰는지는 외부 검증이다.
- 원인/재현: XFF 첫 값을 신뢰한다. 매 요청 다른 값을 보내면 신규 bucket 경로에서 바로 return하여 정리 코드에도 도달하지 않는다. 미인증 요청도 메모리 증가를 만들 수 있다.
- 영향: 제한 우회와 메모리 고갈 조건. 무인증 데이터 접근이 열린다는 뜻은 아니다.
- 수정: 검증되지 않은 XFF 사용 제거, socket 주소 사용, 만료 bucket 선제 정리 및 500개 상한. header 회전으로 240/분 제한을 넘을 수 없는 테스트 추가. Railway proxy 뒤에서는 여러 요청자가 하나의 bucket을 공유할 수 있으므로 실제 ingress trust 규칙을 확인해야 한다.
- 출시 차단: **수정 전 공개 서버에는 예**. 수정 후 개인용 한 기기에서는 proxy 집계 제한을 수용 가능하다.

### M2. AsyncLocalStorage의 만료된 lock 소유권이 후속 비동기 작업에 남음

- 위치: `server/src/file-storage.mjs:9–27`.
- 상태: **결정적 테스트로 확정, 이번 PR 수정**. 현재 Store의 정상 순차 호출에서 데이터 손실이 이미 발생했다는 증거는 아니다.
- 재현: lock callback 안에서 비동기 후속 작업을 예약한 뒤 callback을 종료한다. 다른 caller가 lock을 얻은 동안 예약 작업에서 같은 lock을 요청하면, 상속된 Set 때문에 대기를 건너뛴다.
- 영향: 재사용 가능한 저장 유틸리티가 더 이상 보유하지 않은 lock을 보유한 것으로 판단해 race 가능.
- 수정: context에 공유 active lease를 보관하고 callback 종료 시 해제. 후손 context도 inactive 상태를 보므로 다시 queue에 진입한다. 실패 후 queue 복구·두 instance 공유·중첩 순차 호출 테스트 포함.
- 잔여 계약: **살아 있는 같은 lock 안에서 Promise.all로 중첩 쓰기를 fork하면 여전히 재진입 우회가 가능**하다. 현재 Store 내부는 순차 await이고 해당 병렬 call graph는 발견하지 않았다. 모든 임의의 중첩 패턴이 안전하다고 보증하지 않는다. 서로 다른 lock을 역순으로 얻는 일반 ABBA도 금지해야 한다.
- 출시 차단: 현재 caller에서 확인된 장애는 아니지만 저장 기반 유틸리티 수정은 권장 필수. 다중 process/replica 안전성은 제공하지 않는다.

### M3. PDF와 metadata의 cross-file transaction 부재

- 위치: `server/src/server.mjs:379–431,450–455`; `server/src/report-pdf-store.mjs:21–48`; `server/src/file-storage.mjs` atomic write.
- 상태: **장애 시나리오는 코드상 확정; 실제 crash/디스크 장애는 외부 조건. 미수정**.
- 재현: PDF 저장 성공 직후 metadata 쓰기를 실패시키거나 process를 종료한다. 또는 metadata 삭제 후 PDF unlink를 실패시킨다. JSON/PDF 각각의 atomic rename은 두 파일 전체를 묶지 못한다.
- 영향: 고아 PDF, metadata와 내용 불일치. PDF GET은 metadata 존재를 다시 확인하지 않으므로 unlink 실패 후 기존 유효 signed URL로 파일이 계속 열릴 수 있다. 이미 다운로드·브라우저 캐시한 PDF는 삭제로 회수되지 않는다.
- 검증: 정상 변경 경로의 lock 순서는 report-operation → ReportStore-file이다. PDF body를 먼저 읽고 lock 안에서 최신 metadata를 읽으므로 느린 upload가 옛 metadata를 덮는 이전 문제는 개선되었다. 반대 순서로 operation lock을 얻는 현재 경로는 발견하지 않았다. metadata/PDF 읽기는 같은 operation lock으로 묶이지 않아 중간 상태를 볼 수 있다.
- 수정안: 버전별 PDF 파일 + manifest commit 또는 journal/recovery와 orphan 정리. 작은 완화책으로 PDF GET의 metadata 확인, stat 기반 존재 검사, 실패 복구 기록. 단일 process라도 cross-file 원자성은 별도다.
- 출시 차단: **개인 베타에서는 백업·복구 절차가 있으면 수용 가능**, 무손실 보관/삭제 보장이 요구되면 차단.

### M4. 부분 push 성공·timeout·재시작에서 누락/중복; outbox 없음

- 위치: `server/src/expo-push.mjs:51–97`; `server/src/surge-push-monitor.mjs:33–56`; `server/src/server.mjs:222–225`의 sendPush 후 receiptStore.add 연결부; `server/src/push-receipt-monitor.mjs:36–62`.
- 상태: **코드상 확정, 미수정**.
- 재현: 두 기기에 성공 ticket/일시 오류 ticket을 각각 반환 → sent>0이어서 전체 eligible baseline 전진, 실패 기기는 재시도하지 않는다. 첫 batch 성공 후 다음 batch timeout이면 이전 ticket이 반환·저장되지 않는다. Expo가 수락한 직후 timeout/프로세스 종료 또는 receipt 파일 쓰기 실패도 같은 불확실성을 만든다.
- 영향: 알림은 exactly-once도 at-least-once도 보장하지 않는다. 재시도는 중복될 수 있고 receipt 오류는 DeviceNotRegistered 외에는 경고 후 삭제되어 재전송되지 않는다. 재시작 첫 poll은 baseline 설정만 하므로 중단 중 새 급등을 알리지 않는다.
- 수정안: event/device별 persistent outbox, 송신 상태·ticket을 batch별 영구화, 지수 backoff와 중복 억제 event ID. 가격 알림을 주문/위험관리 수단으로 사용하지 않는 개인 베타라면 best-effort를 명시한다.
- 출시 차단: **best-effort 개인 베타에서는 아니오**. 전달 보장이 요구되면 예.

### M5. 만료 receipt만 남으면 정리되지 않음

- 위치: `server/src/push-receipt-monitor.mjs:27–65`.
- 상태: **재현 테스트로 확정, 이번 PR 수정**.
- 재현: store에 24시간 초과 receipt만 저장 → pending=[] → cleanup 이전 return. 계속 파일에 남는다.
- 영향: pending 통계/저장 공간 오염. 전체 store는 1000개 상한이므로 이것만으로 무제한 메모리 누수는 아니다.
- 수정: 만료·잘못된 createdAt 제거를 pending empty return보다 먼저 실행. 재시작 후 15분 이상 된 ticket 조회, unresolved 유지, invalid token 제거 테스트도 추가.
- 잔여: 영구 저장되는 것은 **대기 ticket**이며 receipt 성공/오류 이력 전체가 아니다. 완료 항목은 삭제된다. 상한 1000에서 오래된 항목 탈락, 조회 첫 300이 계속 unresolved이면 뒷 항목이 밀릴 수 있다.
- 출시 차단: 수정은 포함했으며 개인 베타의 단독 차단 사유는 아님.

### M6. 홈·관심종목·설정의 오래된 응답과 저장 결과 덮어쓰기

- 위치: 홈 `mobile/src/app/(tabs)/index.tsx:63–84,118`; 관심 `watchlist.tsx:35–93`; 설정 `settings.tsx:75–107`.
- 상태: **비동기 순서상 확정 가능 경로, 실기기 재현 미실행; 미수정**.
- 재현: 홈 refresh A를 지연시키고 B를 먼저 완료 → 늦은 A가 새 화면 상태를 덮는다. 관심 목록/search 역시 request ID/취소 가드가 없다. add/remove 후 목록 재조회가 실패해도 loadWatchlist가 catch로 삼킨 뒤 성공 문구가 출력된다. 설정 초기 GET 지연 → 먼저 저장한 새 기준을 뒤늦은 GET 값으로 화면에서 덮을 수 있다.
- 영향: 오래된 가격·검색·규칙 표시, 실제 저장 상태와 UI 불일치. cleanup 없는 경로는 unmount 후 state setter도 실행할 수 있다. 현대 React에서 이 사실만으로 메모리 누수나 crash라고 단정하지 않는다. 홈은 loading 중 loadError=false이면 LIVE badge가 다시 표시된다.
- 수정: 요청 generation/AbortController 및 focus cleanup, 쓰기 이후 초기 읽기 응답 폐기, 결과와 loading/error를 분리. 목록 재조회 실패를 저장 성공과 별도 표시.
- 출시 차단: **새 종목/가격을 잘못 표시하는 경로는 출시 전 수정 권장 필수**, 단순 설정 메시지 문제만으로 APK 설치를 차단할 필요는 없다.

### M7. 종목 전환에서 이전 종목 상태 노출 및 보지 않은 보고서/종목 기록

- 위치: `mobile/src/app/stock/[market]/[code].tsx:40–78`; `mobile/src/app/report/[id].tsx:24–38`; `mobile/src/lib/market-api.ts:135–154`.
- 상태: **코드상 확정, 미수정**.
- 재현: 동일 route component에서 종목 A→B, B 응답 지연. stock state에 market/code key가 없어 A detail이 B params와 함께 렌더링될 수 있다. A 요청 직후 화면을 벗어나도 recordStockView/markReportRead가 active 검사 전에 실행된다. POST 실패는 catch{}로 소실된다.
- 영향: 종목/통화/링크와 이전 가격의 혼동, 열람하지 않은 자료가 읽음 처리, offline 기록 유실. Report 상세 자체는 id-key 상태를 사용해 이전 본문 노출을 방어하고 있다.
- 수정: stock state에 resource key, active 검사 후 기록, 기록 실패 표시 및 선택적 영구 retry queue. firstReadAt을 덮지 않는 서버 수정은 유지.
- 출시 차단: **종목 혼동은 예**. offline read/view retry 부재만은 개인 베타에서 수용 가능.

### M8. 외부 PDF URL 회귀 및 PDF 열기 실패 무표시

- 위치: `server/src/report-store.mjs:23–34`; `server/src/server.mjs:379–392`; `mobile/src/lib/market-api.ts:334–345`; `mobile/src/app/(tabs)/reports.tsx:96–105`; `mobile/src/app/report/[id].tsx:123–128`.
- 상태: **코드상 확정, 미수정**.
- 재현: publisher가 정상 HTTPS 외부 pdfUrl을 가진 보고서를 저장하고 로컬 PDF를 올리지 않는다. PDF 버튼은 보이지만 항상 내부 pdf-link를 요청하며 서버는 로컬 파일 없음으로 404. API helper는 null로 삼키므로 아무 일도 일어나지 않는다. 네트워크 실패도 같은 결과; Linking.openURL reject는 catch가 없다.
- 영향: 기존 허용 데이터 형식의 PDF가 열리지 않고 원인을 알 수 없다.
- 수정: 내부 PDF만 signed URL을 받고 외부 URL은 검증한 http(s)로 열기. 모든 open 실패를 사용자에게 알리기. 외부 host에 API key를 보내지 않는다.
- 출시 차단: 외부 PDF를 사용하면 **예**; 내부 업로드만 쓰면 오류 피드백 개선 필요.

### M9. 초기 notification response와 listener 사이 중복/역순 이동

- 위치: `mobile/src/hooks/use-push-notifications.ts:57–115`.
- 상태: **비동기 순서상 재현 가능한 조건, 실기기 외부 검증; 미수정**.
- 재현: getLast 응답 A 지연 중 실시간 B 수신 → B 처리 후 늦은 A도 처리. ref는 마지막 ID 하나만 기억한다. clearLastNotificationResponseAsync의 반환 Promise를 await/catch하지 않아 실패가 unhandled rejection이 될 수 있다.
- 영향: 오래된 알림에 의해 재이동/중복 push navigation. 현재 모든 payload screen=movers라 같은 탭 중복 이동이 주 영향이다.
- 수정: listener 등록 후 초기 조회, live response가 처리되면 오래된 initial 폐기, bounded ID set, clear 실패 처리와 새 응답 경합 고려. foreground banner/channel은 코드에 있으나 background/종료/강제종료 차이는 실기기 검증이 필요하다.
- 출시 차단: 단독으로는 개인 베타 차단 아님. FCM 실제 전달 미검증은 별도 gate.

### M10. 요청 동시성은 호출별 제한; 장 마감 polling과 반복 요청 비용

- 위치: `server/src/naver-provider.mjs:350–368,382–388,400–429,468–518`; `server/src/economic-calendar-provider.mjs:225–285`; `server/src/surge-push-monitor.mjs:6–7,25–33,72–77`; `server/src/bounded-cache.mjs`.
- 상태: **구조는 확정, 실제 자원 고갈·요금은 미측정; 미수정**.
- 재현: 서로 다른 종목 상세/홈/관심 요청 동시 실행. 동일 Naver URL의 겹치는 fetch는 합쳐지지만 완료 후 quote 재호출은 캐시가 없다. concurrency6/5는 호출당 한도이며 모든 HTTP 요청을 합친 전역 한도가 아니다. calendar는 최대 16개 Nasdaq 요청을 한 번에 실행하고 symbols/days가 다른 key끼리 upstream 중복 제거가 없다.
- 영향: 느린 공급자에서 80종목×6 worker는 약 14wave, 7초 timeout이면 약98초까지 지연 가능(다른 작업 제외한 상한 산술). 모바일 60초 timeout 뒤에도 서버 작업이 이어질 수 있다. 실제 항상 이 시간/부하라는 뜻은 아니다.
- 비용: 등록 기기0이면 loadAlerts 전에 반환하므로 시장 외부 polling은 중단된다. timer/token 파일 읽기는 남는다. 기기가 있으면 장 마감/휴일 필터 없이 2분 주기, 하루720회. 2ranking이면 하루1440 요청, 조건이 계속 맞아 최대20 history를 매회 조회하면 추가14400 요청의 산술 상한(캐시/후보/실패에 따라 감소). 앱 수동 조회는 별도.
- 정상 확인: in-flight Promise는 성공/실패 모두 finally에서 제거, 후속 retry 가능. BoundedCache 항목 상한256; TTL은 ranking45초/history90초/news5분, calendar15분. 무제한 cache key 누수로 단정할 근거 없음. 값의 byte-size 상한은 별도 문제다.
- 수정: 전역 semaphore, 짧은 quote 캐시, client 취소 전파, calendar raw URL dedupe, 시장별 세션 스케줄, 실패 backoff/측정 지표. Railway Free/Hobby 메모리·CPU·egress 및 비용은 실제 계측해야 한다.
- 출시 차단: 개인 소수종목 베타 단독 차단은 아님. 전체시장으로 단순 확장하는 것은 차단.

### M11. 보고서 무제한 보존은 가능하지만 전체 JSON/버퍼와 Volume 용량은 증가

- 위치: `server/src/report-store.mjs:79–138`; `server/src/report-pdf-store.mjs:21–36`; `server/src/server.mjs:379–412`; `mobile/src/app/(tabs)/reports.tsx:55–111`; `Dockerfile:7–9`.
- 상태: **구조 확정, 용량 도달 시점은 조건부; 미수정**.
- 재현: 보고서를 수년치 쌓으면 매 get/upsert/remove가 전체 JSON read/normalize/sort/serialize. 모바일은 전체 목록을 렌더링한다. PDF-link 존재 확인도 PDF 전체 read, 실제 다운로드에서 다시 read. 업로드는 전체 buffer 및 concat 메모리 비용이 있다.
- 영향: 400개 제한 제거는 데이터 보존 측면에서 올바르지만 지연/메모리/디스크 문제를 없애지는 않는다. 1MB PDF 하루2개라는 가정만으로 연730MB, metadata·백업은 별도다.
- 수정안: 목록 pagination/가상화, metadata index 또는 SQLite, stat/stream, 저장량 경고·백업 및 복구 훈련. Volume은 DATA_DIR에 실제 mount되어야 한다. 원자 쓰기는 임시파일 때문에 추가 여유 공간을 요구한다. 손상 JSON은 덮어쓰지 않고 오류를 내는 현재 동작을 유지한다.
- 출시 차단: **Volume mount·복구 가능한 백업이 없으면 예**. 소량 개인 베타에서 DB 전환 자체는 필수 아님.

### M12. AI 동일 동시 요청 중복, 작은 등락률/ratio 변화로 cache 무효화

- 위치: `server/src/openai-analysis.mjs:75–116,122–169`; `server/src/ai-budget-store.mjs:42–59`; `server/src/server.mjs`의 stock-detail 분석 호출.
- 상태: **코드상 확정, 미수정**. 실제 유료 API는 호출하지 않았다.
- 재현: 동일 enhanceMovementReason를 Promise.all로 동시에 호출하면 둘 다 cache miss 후 reserve/fetch. 다음 quote의 changePercent 또는 volumeRatio가 미세하게 변해도 SHA key가 달라진다. **가격 price 그 자체는 key에 없다**; '가격 한 틱마다 반드시 miss'라는 표현은 부정확하다.
- 영향: 기본 일일12회가 빨리 소진될 수 있다. 500/timeout/빈출력/JSON parse 실패도 이미 reserve한 횟수를 소비한다. 이것은 과금 발생 여부가 불확실한 요청을 보수적으로 세는 정책이며 무료 환급을 임의로 구현하면 안 된다.
- 정상 확인: 두 BudgetStore instance의 30개 동시 reserve에서12개만 허용되는 테스트 통과. 파일이 같은 단일 process 조건이다. strict object schema는 모든 property required/additionalProperties=false. gpt-5.6-terra, Responses, reasoning low/standard는 공식 문서와 일치한다. max_output_tokens450은 reasoning 포함 부족할 가능성이 있으나 실제 실패로 단정하지 않는다.
- 보안: 무인증 API 요청은 AI에 도달하지 않는다. APK 앱 키를 획득한 외부자는 상세 호출로 일일 budget을 소진할 수 있다. server OpenAI key가 APK에 포함되는 경로는 발견하지 않았다.
- 수정: evidence key별 in-flight dedupe, 의미 있는 변화 구간 또는 시간창 cache 정책, budget을 요청수 제한으로 명시하고 실패 지표/실제 usage 분리. 외부 key 보유자 차단은 앱 인증 구조 결정 사항이다.
- 출시 차단: **AI 보조 기능의 개인 베타에서는 아니오**. 실제 키/모델 접근/응답 검증은 필요하다.

## Low

### L1. 잘못된 PDF signature 문자열이 401 대신 서버 오류

- 위치: `server/src/server.mjs:143–150`.
- 상태: **확정, 이번 PR 수정**.
- 재현: 유효 범위 expires와 함께 signature에 ASCII가 아닌 문자64개를 전달. JS length는 같아도 Buffer byte 길이가 달라 timingSafeEqual이 throw한다.
- 영향: 최상위 catch에서 오류 응답. 인증 우회나 Node 전체 종료는 아니다.
- 수정: 64자리 hex 검증 후 상수시간 비교. 정상 재사용/만료/wrong-ID/GET 외 method 검증 추가.
- 출시 차단: 단독 차단 아님, 수정 포함.

### L2. Nasdaq 일정 수집 범위와 불확실한 시각 표기

- 위치: `server/src/economic-calendar-provider.mjs:126–157,225–285`; `mobile/src/app/(tabs)/calendar.tsx` 시각 label; 홈 `mobile/src/app/(tabs)/index.tsx:38–44,200`의 eventTime 표시.
- 상태: **확정, 미수정**.
- 재현: days14 요청해도 Nasdaq loop는 i=0..7, 즉 **오늘 포함8개 날짜**만 요청한다. 기존 보고서의 '7일만'은 엄밀히는 '오늘부터7일 후까지'다. before/after/unknown에 임의 대표시각을 넣은 startsAt을 홈이 정확한 시각처럼 포맷한다.
- 영향: 뒤쪽 주의 기업 일정 누락, 미확정 발표 시각 오해. FOMC/BLS까지 모두8일로 제한되는 것은 아니다.
- 수정: 공급자별 horizon/불확실성 표시, 같은 시각 label helper 재사용, 요청량 예산 내 horizon 수집. Nasdaq 제공 범위는 실서비스에서 확인.
- 출시 차단: 개인 베타에서는 아니오. '모든 14일 기업 일정' 보장은 불가.

### L3. APK 앱 API key와 signed URL의 잔여 보안 모델

- 위치: `mobile/src/lib/market-api.ts:1–44`; `server/src/server.mjs:88–110,139–157,379–412`; `mobile/.env.example`.
- 상태: **설계상 확정, 아키텍처 변경 안 함**.
- 재현: 설치 APK/JS bundle에서 EXPO_PUBLIC_API_KEY 추출 → 관심종목/보고서/읽음 상태 조회, 앱에 허용된 쓰기 및 AI 호출 가능. signed URL은 id:expires HMAC이며 발급5분, 검증 최대10분, 기간 내 재사용 가능. 앱 키 보유자는 signature 생성도 가능하지만 이미 같은 PDF 읽기 권한을 가진다.
- 영향: 개인 앱을 타인에게 배포하면 사용자별 격리·회수 불가. URL 공유/로그/브라우저에 노출되면 유효기간 내 PDF 읽기 가능. 링크는 PDF 내용 버전에 묶이지 않아 같은 id 교체 후 새 내용을 열 수도 있다.
- 정상 확인: signed 예외는 해당 GET PDF만 허용. 다른 API/POST/DELETE에는 적용 안 됨. id 변경, 만료, path traversal은 HMAC/id 검증 및 저장소 ID 정규식으로 방어한다. distinct publisher 구성에서 앱 키가 publisher 쓰기를 하는 다른 우회 경로는 발견하지 않았다. 공개 health는 `{ok:true}`만 반환하며 개인 데이터 없음. OPTIONS는 preflight 응답만이고 데이터 읽기 경로가 아니다.
- 수정안: 개인 APK 비공유·키 rotation·HTTPS, 필요 시 per-device credential/서버 세션. publisher/OpenAI 키는 앱에 넣지 않는다. 일회용 signed URL이 필요하면 nonce store가 필요하나 현재 요구사항에는 강제하지 않았다.
- 출시 차단: **개인 비공유 베타에서는 수용 가능**. 다중 사용자/공개 배포에서는 High 수준으로 재평가해야 한다.

## 이전 수정 독립 재검증

| 항목 | 현재 소스에서 확인한 결과 |
| --- | --- |
| `/api/*` 공통 인증 | prefix guard가 라우팅보다 먼저 실행. signed PDF GET만 예외. production app key 누락 거부. publisher 구성 fallback은 H1로 다시 수정 |
| PDF 브라우저 인증 | signed URL 연결 존재. hex 오류 L1, 외부 PDF 회귀 M8, cross-file M3 잔존 |
| atomic JSON 쓰기 | temp wx/0600 → file sync → rename → Linux directory sync. rename 전 쓰기 실패에서 기존 파일 유지 테스트. rename 후 directory sync 실패는 '실패 응답이지만 이미 commit' 가능 |
| 파일 손상 처리 | ENOENT 초기화만 허용; 손상 JSON을 빈값으로 덮지 않음. 강제 종료 전 temp orphan은 남을 수 있으나 원본 JSON 부분 쓰기는 방지 |
| 두 Store instance | 같은 resolved path의 module queue 공유. 순차 중첩 재진입 동작. M2의 만료 ALS 소유권 문제는 새로 발견 |
| Report operation lock | mutation에서 operation→file 순서, 역순 획득 발견 안 됨. 여러 mutation의 정상 순서는 직렬화하지만 cross-file crash transaction은 아님 |
| 400개 보고서/800개 일정 제한 | 보고서400개 초과 보존 회귀 테스트 존재. 제한 제거 확인. 무한 보존 비용은 M11 |
| 같은 ID PDF 보존 | `upsert`가 pdfUrl 미지정/정규화 후 없음이면 기존 pdfUrl 유지. metadata 수정으로 기존 PDF URL이 사라지는 과거 결함 수정 확인 |
| 읽음 상태 | first read timestamp 유지. 서버 영속화 있음. offline 재시도 및 보지 않은 항목 기록 M7 잔존 |
| 사용자 급등 기준 | 서버 movers enrichment/filter, push, home의 주요 경로가 저장된 rule 사용. provider 기본 인자만 보고 5/3 고정 버그라고 판단하지 않음. 별도 요청 사이 설정 변경의 snapshot 차이 가능 |
| 시세 날짜·거래량 | synthetic payload상 개선됐지만 실제 필드/세션에서 H2/H3 확인. 이전 완료 판정 불가 |
| 요청 합치기/worker | 동일URL success/reject/retry, 결과 순서 유지, 관심6/history5 및20대상 제한 테스트 통과. 전역 제한은 아님 |
| sample fallback | DEMO_MODE=false의 주요 screen API에서 transport error를 sample로 바꾸는 경로는 제거. helper에 남은 catch→[]와 서버 partial error, LIVE 조건 때문에 '모든 오류 구분 완료'는 아님 |
| 모바일 가드 | movers generation, calendar/reports focus active, report detail id-key 확인. home/watchlist/stock/settings 잔여 경합은 M6/M7 |
| push receipt | ticket 파일 저장→재시작 복원→15분 이상 ticket 조회→invalid token 제거 구현. 완료 receipt 이력 보관/outbox는 없음. M5 새 발견 |
| AI budget | 두 instance 동시 일일 상한 테스트 통과. 모델 호출 형식은 최신 공식 문서와 일치. cache 중복은 M12 |

## 직접 실행한 검증과 한계

- 원본 서버 테스트 **54개 통과**. 이번 수정 후 **71개 통과**. 기존 성공만으로 실응답 호환성이 증명되지 않음이 H2에서 확인됐다.
- 새 final-audit 테스트15개 중 원본은 **8개 실패/7개 통과**, 수정 후 모두 통과. 실제 응답 필드/날짜·없는 timestamp, in-flight retry, worker limits, 만료 receipt, 재시작 receipt, ALS lease, 두 Store/atomic 실패/AI 예산을 검증한다.
- HTTP 회귀: production publisher 누락/동일값 거부2개 추가. 기존 통합 테스트에 보호된16개 GET 경로의401, publisher 작업 app key 거부, signed URL 재사용/만료/wrong ID/문자열 이상/쓰기 우회 거부, XFF 회전 제한 검증 추가.
- `npm run typecheck`, `npm run lint` 통과.
- `CI=1 npx expo export --platform android --output-dir /tmp/stock-interest-final-android` 통과, Hermes bundle 약2.9MB. 모바일 소스는 이번 PR에서 변경하지 않았다.
- 로컬 런타임 Node24.19.0. CI/Docker는 Node22.13 계열이므로 같다고 간주하지 않았다.
- **Docker build는 실행 시도했으나 이 환경에 docker 명령이 없어 exit127; 성공으로 기록하지 않는다.** CI에 Docker build job은 존재한다. 이번 PR의 실제 CI 결과는 별도로 확인해야 한다.
- EAS native APK, FCM 송수신, Railway 실제 Volume mount·재시작·부하·요금, OpenAI 유료 실호출은 실행하지 않았다. 계정/credential이 필요한 검증을 mock 테스트로 대체하여 완료 표시하지 않았다.
- 아직 빠진 중요한 테스트: UI deferred-response 경합·PDF 오류 interaction, PDF/metadata 단계별 process kill 및 복구, 실제 파일시스템 ENOSPC/fsync 오류, nested same-lock Promise.all 금지 계약, push batch별 부분 성공/outbox 재시도, 장중/장후/휴장/미국 DST 세션 fixtures, schema 변경/error-shaped200, 장시간 자원 계측.

## 실응답 관찰 범위

읽기 전용 GET으로 KR/US ranking, 양국 basic, KR303810/US NVDA daily history 및 제한된 pagination을 확인했다. 양국 basic의 가격·regular-session timestamp는 읽혔으나 `overMarketPriceInfo`의 장후 가격은 사용하지 않는다. 따라서 표시가 '항상 최신 장후 가격'이라고 보장되지 않는다. `tradableStatusUpdatedAt`은 거래 시각이 아니므로 timestamp 대용으로 추가하지 않았다. 표본은 전체 schema 계약이나 모든 종목의 volume 유무를 증명하지 않는다.

## 배포·운영 검증 기준

- Railway **1 replica뿐 아니라1 Node process**. 파일 lock은 OS/distributed lock이 아니다. 다중 process로 전환하면 DB/외부 lock이 필요하다.
- 실제 `DATA_DIR`와 Volume mount 경로 일치, 서로 다른 app/publisher 키, production 환경, HTTPS 확인. `/health`는 생존 확인일 뿐 Volume writable/외부 시세 신뢰성 검증이 아니다.
- EAS preview가 APK이고 production profile은 AAB. 사용자 목적에는 preview/internal APK가 맞다. app.json에는 EAS projectId/Android googleServicesFile이 없으므로 EAS 설정·주입 여부를 실제 build에서 확인해야 한다. source 부재만으로 실제 계정 구성도 없다고 단정하지 않는다.
- Android package와 Firebase 앱 일치, FCM v1 credential·google-services 설정, projectId로 Expo token 등록 확인. foreground/background/swipe 종료/OS 강제종료/배터리 제한/권한 거부 후 재허용/토큰 변경을 나누어 테스트한다.
- Expo ticket ok는 단말 수신 증명이 아니다. receipt는 최소15분 후,5분 주기라 일반적으로15–20분 후 조회하며 재시작 후 첫 확인은 최대5분 대기한다. payload는 종목3개 및 문자열 길이 제한이 있어 일반적으로 작지만 최종 serialized UTF-8 byte<=4KB 검증을 추가하면 계약이 명확해진다.
- Volume 데이터와 PDF의 백업·복원 검증, disk free 경고, 24시간 CPU/RSS/외부 요청/네트워크/월간 추정 비용 측정. 공식 Railway 문서상 기본 Volume은 Free/Trial0.5GB, Hobby5GB이며 실제 할당·청구는 대시보드에서 확인해야 한다.

## 외부 근거

- [OpenAI Terra 모델: Responses, Structured Outputs, reasoning effort](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [OpenAI reasoning guide: standard/pro mode](https://developers.openai.com/api/docs/guides/reasoning)
- [Expo push 송신 및 receipts](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Expo Android FCM credentials](https://docs.expo.dev/push-notifications/fcm-credentials/)
- [Railway Volumes](https://docs.railway.com/reference/volumes)
- [Railway pricing](https://docs.railway.com/reference/pricing/plans)

## 출시 차단 항목

- [ ] H1/H2 및 M1 수정 병합 후 **서로 다른 production 키**로 배포 검증.
- [ ] H3: 세션·거래량 배수 정의/데이터를 검증하고 unknown이 정상값처럼 표시되지 않도록 처리.
- [ ] H4: 전체시장 요구 충족 또는 후보 한정 베타 범위의 명시적 결정. 현재 상태를 전체시장 감시라고 출시하지 않기.
- [ ] H5/H6: 시세 전체 실패를 정상 빈 결과로 표시하지 않기; 시세 장애에도 보고서 목록 접근 가능하게 하기.
- [ ] M6/M7: 이전 요청이 새 종목/가격 상태를 덮거나 다른 종목과 함께 표시되는 경로 차단.
- [ ] M8: 외부 PDF를 사용한다면 열기 회귀 수정. 내부 PDF도 실패 원인 표시.
- [ ] 실제 APK/FCM, 현재 commit의 Docker/CI, Railway Volume 영속화·백업 복원 확인.

## 개인용 APK 베타에서 수용 가능한 잔여 위험

소수 종목·한 기기·비공유 APK·best-effort 알림임을 전제로: 앱 키 추출 가능성, signed URL 단기 재사용, 알림 outbox 부재로 누락/중복, offline read/view retry 부재, 장 마감 polling 비용, 단일 process 파일 저장, crash 시 PDF orphan 가능성, 제한된 Nasdaq horizon, AI cache/budget의 보수적 소비. 이는 High 미해결 항목을 자동 면제하지 않는다.

## 실기기/실서비스에서만 검증 가능한 항목

EAS native build/설치 및 Firebase 연결, 실제 token→ticket→receipt→단말 표시, 종료 상태별 이동과 response 정리, 실제 Railway ingress header·Volume/재배포 복원·ENOSPC 대응·24시간 비용, 장중 KR/US 데이터 세션·ratio 계약, 실제 OpenAI 계정의 모델 접근·출력과 latency.

## 최종 판정

**원본6531590: 출시 보류. 이번 Draft PR: 확정 결함 일부 수정 및 증거 강화이며 출시 승인 아님.** 현재 제품을 '한국·미국 전체시장 실시간 급등 감시 앱'이라고 평가할 근거는 없다. High 항목 및 종목 상태 혼동을 해소하고 APK/FCM/Volume 검증을 완료한 뒤, 범위를 명시한 개인 베타로 재판정하는 것이 타당하다. UI 디자인·공급자·인증 아키텍처는 임의로 변경하지 않았다.
