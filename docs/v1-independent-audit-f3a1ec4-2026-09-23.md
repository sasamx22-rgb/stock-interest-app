# 개인용 Android V1 독립 출시 감사 — 2026-09-23

검증 대상: `chatgpt/live-naver-market-data`, **`f3a1ec4b114a8f23c770d0dde6d8e3878fe7327f`**.
원격 Git blob 95개를 로컬 파일과 해시 비교했고 불일치는 0개였다. 아래 줄 번호는 이 SHA 기준이다. 과거 리뷰의 체크 표시를 검증 증거로 사용하지 않았다. 개인 1명, 비공개 APK, 단일 Node 프로세스/1 replica, `/data` Volume, 양쪽 급등 플래그 OFF 조건이다.

**판정: 개인용 APK 베타 가능.** 신규 확정 Critical/High는 발견하지 않았다. 아래 Medium/Low와 실환경 검증은 남아 있으므로 무조건적인 V1 정식 출시 완료 판정은 하지 않는다. 거래량 ratio 계약과 전체시장 급등 탐색은 해결된 것이 아니라 V1 실행 범위에서 제외됐다.

## 직접 실행한 검증

| 검증 | 이번 실행 결과 / 한계 |
|---|---|
| 원본 `npm test` | 104/104 통과. 과거 CI 결과 재인용 아님 |
| 독립 추가 테스트 | 12개 통과: retry matrix, 본문 timeout 결함, 일정 동시 요청/부분 장애 캐시, production 서버/재시작 |
| `npm run typecheck` | 통과 |
| `npm run lint` | Expo lint 통과 |
| `CI=1 npx --no-install expo export --platform android --output-dir /tmp/market-v1-android` | 통과. Hermes `.hbc` 약 2.9MB. APK native 빌드/설치는 아님 |
| 로컬 `docker build -t market-pulse-v1-audit .` | 직접 시도, `docker: command not found`(127). Docker 실행 결과는 별도 새 감사 PR CI에서 확인 |
| production HTTP | 서로 다른 app/publisher key, health, 인증/권한, 저장된 보고서와 PDF, 시세/홈, 장애 응답을 child Node 서버로 실행 |
| 재시작 | 동일 DATA_DIR에서 보고서 metadata 재게시 시 PDF 유지, 프로세스 종료/재시작 후 PDF signed GET과 관심종목 조회 성공 |

로컬 Node 24.19.0. CI Node 22.13.1, Docker 기반 이미지는 Node 22.13 Alpine. HTTP 테스트 외부 공급자는 통제된 mock이다. 실제 장중 Naver 계약, 실제 OpenAI 계정 권한, Railway Volume와 EAS native는 이 결과로 검증됐다고 주장하지 않는다.

`server/test/v1-independent-audit.test.mjs`의 `known limitation` 테스트는 **결함 재현용 characterization**이다. 통과가 해당 결함의 해결을 뜻하지 않는다. 향후 수정 시 정상 동작을 기대하도록 테스트도 바꿔야 한다. 이번 감사 PR은 테스트/문서만 추가하며 제품 코드는 변경하지 않는다.

## Critical / High

**확정된 신규 Critical 0, High 0.** 개인용 APK에서 추출 가능한 app key만으로 SaaS 수준 인증을 요구하거나 출시 차단하지 않았다. 공급 장애·부분 데이터·파일 간 crash window는 아래 실제 영향에 맞춰 분류했다.

## Medium — 확정 문제 및 잔여 제약

### M1. GET 타임아웃이 응답 본문을 보호하지 않는다

- 위치: `mobile/src/lib/market-api.ts:40–73`.
- 판정: **확정**, 추가 테스트로 타이머 해제 시점을 재현.
- 원인: `fetch()`가 헤더를 반환하면 `finally`에서 abort timer를 해제하고, 그 뒤 `response.json()`을 기다린다. 본문 다운로드 실패도 재시도 catch 밖이다.
- 재현: 200 헤더 후 JSON 본문을 끝내지 않는 서버/프록시 응답. 또는 `json()` 지연 mock에서 `clearTimeout`이 먼저 실행되는지 검사한다.
- 영향: 홈/보고서/상세 로딩이 20초 제한 없이 대기하거나 본문 전송 중 network error가 GET 재시도 대상에서 빠진다. 실제 발생 빈도는 모바일 네트워크에 의존한다.
- 수정: fetch부터 본문 소비까지 동일 abort 범위로 묶고 네트워크/abort 오류만 최대 1회 재시도한다. JSON 스키마/파싱 오류를 무조건 재시도하지 않는다. 비정상 HTTP 본문도 정리한다.
- 개인용 APK 베타 차단: **아니오**. 정식 V1 전 우선 수정 권장.

### M2. 일부 일정 공급 장애를 정상 데이터로 2시간 캐시한다

- 위치: `server/src/economic-calendar-provider.mjs:270–306`; `server/src/server.mjs:300–305,565–568`.
- 판정: **확정**, BLS 성공/Nasdaq 전체 실패 → 복구 후 재요청에도 Nasdaq 요청 0회 재현.
- 원인: 외부 성공이 하나라도 있으면 실패 정보를 버린 배열을 캐시한다. 홈은 함수가 resolve하면 `calendar:ok`, 상세는 전체 장애도 `catch(()=>[])`로 숨긴다.
- 재현: BLS는 정상 빈 ICS, Nasdaq 16건은 모두 실패하게 한다. 이후 Nasdaq을 정상화하고 같은 날 다른 미국 ticker를 요청한다. 2시간 동안 누락이 유지된다.
- 영향: 실적/배당 일정 누락을 실제 일정 없음으로 오해하고 top3/AI의 일정 근거도 불완전해진다. 전체 공급 실패 시 홈 PARTIAL 처리는 별도로 정상 작동한다.
- 수정: 공급자별 status/수집 범위를 반환하고 부분 장애를 표시한다. 성공 원본은 2시간 공유하되 실패 공급자만 짧은 backoff 후 재수집한다. 상세에도 calendar availability를 전달한다. 수동 일정은 외부 장애와 독립적으로 유지한다.
- 개인용 APK 베타 차단: **아니오**, 일정의 완전성을 전제로 사용하면 안 됨. 정식 V1 전 우선 수정 권장.

### M3. 한국 종목 상세도 Nasdaq 16건을 요청한다

- 위치: `server/src/server.mjs:565–568`; `server/src/economic-calendar-provider.mjs:262,280–292`.
- 판정: **확정**, production HTTP 테스트에서 KR 상세 1회에 Nasdaq 16건 확인.
- 원인: 상세가 KR/US 모두 `symbols:[symbol]`을 전달한다. provider는 non-empty symbols를 미국 기업 일정 요청으로 취급한다.
- 재현: 한국 관심종목만 두고 홈 → `/api/stocks/KR/000001`. 홈 macro 캐시가 있어도 corporate 캐시가 따로 채워진다.
- 영향: 쓸모없는 요청과 상세 지연. 관심종목에 미국 종목이 없으면 Nasdaq을 생략한다는 최적화가 상세에는 적용되지 않는다.
- 수정: KR 상세는 `symbols:[]`, US만 ticker 전달. macro 데이터와 corporate 데이터는 필요에 따라 공유하되 US 전환 시 기업 데이터가 누락되지 않게 테스트한다.
- 개인용 APK 베타 차단: **아니오**.

### M4. 일정 공유 캐시에는 in-flight 병합이 없다

- 위치: `server/src/economic-calendar-provider.mjs:262–306`.
- 판정: **확정**, 두 동시 cold 요청에서 외부 요청 **34회** 재현(순차 요청은 17회 유지).
- 원인: cache miss 이후 await 구간을 공유하지 않는다. 늦게 끝난 부분 실패 결과가 먼저 저장된 완전 결과를 덮는 것도 코드상 가능하다.
- 재현: 새 provider에서 미국 ticker 두 개로 `Promise.all(upcoming(...), upcoming(...))`.
- 영향: 홈/일정/상세를 빠르게 열면 같은 BLS/Nasdaq 데이터를 중복 다운로드한다. 개인 1명에서는 무한 폭주가 아니라 동시 요청 수에 비례한다.
- 수정: source cache key별 promise를 저장하고 finally 제거. M2의 공급자 품질도 함께 보존한다.
- 개인용 APK 베타 차단: **아니오**.

### M5. 관심종목 시세 부분 실패를 표시하지 않는다

- 위치: `server/src/naver-provider.mjs:412–424`; `server/src/server.mjs:292–334`.
- 판정: **확정**. 전체 실패는 throw하지만 일부 실패는 성공 quote만 반환한다.
- 재현: 20개 중 2개의 basic 응답만 500/잘못된 가격으로 만든다.
- 영향: 홈 오늘의 관심 종목/선정 후보에서 빠진 종목을 사용자가 알아채기 어렵다. 저장된 관심종목 자체는 삭제되지 않는다. 관심종목 탭은 metadata 목록을 조회하며 현재가 목록 화면과 동일하지 않다.
- 수정: failedSymbols/quote coverage를 별도로 전달하고 부분 실패임을 표시. 실패한 종목을 0원/샘플로 대체하지 않는다.
- 개인용 APK 베타 차단: **아니오**.

### M6. AI 지연과 모바일 재시도/동일 요청 cache가 충돌할 수 있다

- 위치: `server/src/openai-analysis.mjs:75–108,145–151`; `server/src/server.mjs:565–619`; `mobile/src/lib/market-api.ts:40–59`.
- 판정: **확정 구조**, 실제 발생 빈도는 외부 지연에 의존.
- 원인: 상세는 일정 → 상세 공급자 → AI를 기다린다. AI 단독 timeout 25초가 모바일 헤더 timeout 20초보다 길다. AI는 완료 결과 캐시만 있고 동일 evidence 진행 중 요청의 병합이 없다.
- 재현: AI mock 응답을 20초 이상 지연시키고 같은 상세 GET을 재요청하거나 동일 요청 두 개를 동시에 보낸다. budget reserve가 각각 실행된다.
- 영향: 성공 가능한 상세가 앱에서 timeout 처리되고 같은 분석이 일일 12회 budget을 중복 소비할 수 있다. 예산 상한 자체의 race는 발견하지 않았다.
- 수정: AI evidence별 in-flight 병합, 전체 상세 deadline 안에서 AI fallback. 소폭 등락률 변화에 따른 cache key 민감도는 근거 신선도를 유지하는 짧은 최소 재분석 간격으로 조정한다.
- 개인용 APK 베타 차단: **아니오**. AI OFF로도 핵심 기능 사용 가능.

### M7. 21일 일정 요청이 21일 기업 일정을 뜻하지 않는다

- 위치: `server/src/economic-calendar-provider.mjs:237–238,281–283`.
- 판정: **확정 범위 제약**. Nasdaq은 오늘부터 +7일까지 8개 날짜 버킷만 수집한다.
- 재현: `days:21`로 호출해 Nasdaq URL의 날짜를 기록한다. +8일 이후 요청은 없다.
- 영향: BLS/FOMC와 기업 일정의 커버리지가 다르지만 배열에 이를 표현하지 않는다.
- 수정: 기업 일정 제공 범위를 명시한다. 무조건 21일×2건으로 늘리는 것은 비용 대비 우선순위가 낮다.
- 개인용 APK 베타 차단: **아니오**.

### M8. PDF와 metadata는 하나의 transaction이 아니다

- 위치: `server/src/server.mjs:452–465,486–490`; `server/src/file-storage.mjs:44–62`.
- 판정: **확정 crash window**, 실제 Railway 데이터 손실 발생은 확인하지 않음.
- 원인: PDF atomic 교체와 metadata 저장은 별개다. 삭제도 metadata 제거와 PDF unlink가 별개다. report operation lock은 동시 작업 순서를 보장하지만 프로세스 종료를 되돌리지 못한다.
- 재현: PDF rename 직후 metadata 쓰기에 ENOSPC 주입, 또는 삭제 metadata 완료 직후 프로세스 종료. 파일과 링크 상태가 일시 불일치/고아 파일이 된다.
- 영향: 게시 요청 실패인데 PDF만 바뀌거나 삭제된 보고서의 PDF 파일이 남는다. PDF GET은 metadata 존재를 다시 요구하지 않아 남은 파일은 유효한 read 권한/서명으로 읽힐 수 있다.
- 수정: 작은 journal/recovery marker 또는 versioned PDF 파일 + metadata pointer, 고아 파일은 자동 삭제보다 검출/백업 후 정리. 단일 사용자에게 즉시 DB 이전을 요구하지 않는다.
- 개인용 APK 베타 차단: **아니오**, 원문 외부 보관/Volume 백업 권장.

### M9. 보고서의 모호한 종목명이 검색 첫 결과에 자동 연결된다

- 위치: `server/src/today-focus.mjs:93–102`.
- 판정: **확정 fallback**, 실제 특정 보고서 오매핑 사례는 미확인.
- 원인: 이름/심볼 exact match가 없으면 `results[0]`을 채택한다.
- 재현: 보고서 ticker와 정확히 일치하지 않는 다른 회사 검색 결과 1개를 반환한다.
- 영향: 보고서가 언급하지 않은 종목이 report 근거를 받아 오늘의 관심 종목에 포함될 수 있다.
- 수정: canonical code/market 저장 또는 정확히 해석 불가한 항목은 unresolved로 남기기. 공급자 교체 불필요.
- 개인용 APK 베타 차단: **아니오**. 게시 스크립트 입력은 정확한 종목 코드/심볼 권장.

## Low — 경계 동작

| ID / 위치 | 확정 여부·원인·재현·영향 | 수정 / 개인용 APK 베타 차단 |
|---|---|---|
| L1 `mobile/src/app/(tabs)/watchlist.tsx:55–80,84–114` | **확정**. 검색 중 다른 탭으로 나가면 generation은 바뀌지만 searching을 해제하지 않는다. 복귀하면 재검색 전까지 spinner가 남을 수 있다. mutation 후 refresh/message도 focus guard가 없어 blur 이후 상태 쓰기가 가능하다. 저장 데이터가 잘못된 종목으로 바뀌는 증거는 없음 | focus 진입 시 transient 상태 정리, mutation completion focus/generation guard. 차단 아님 |
| L2 `mobile/src/lib/market-api.ts:164–183` | **확정**. read/view POST 실패를 삼키고 local retry queue가 없다. 오프라인에서 보고서/상세를 열거나 저장 시 연결을 끊으면 읽음/주간 회고 기록이 누락될 수 있음 | 작은 pending activity queue + idempotent 재전송. 차단 아님 |
| L3 `server/src/engagement-store.mjs:61–62`, `engagement-service.mjs:19–20` | **확정**. 허용되는 report ID `constructor`/`__proto__` 등이 plain object 상속 프로퍼티와 충돌. 해당 ID를 게시하면 unread 판정/읽음 기록이 틀릴 수 있음 | `Object.hasOwn` 또는 null-prototype map. 일반 날짜 기반 ID에는 영향 없음. 차단 아님 |
| L4 `mobile/src/app/(tabs)/_layout.tsx:34–38`, `movers.tsx` | **확정**. `href:null`은 탭을 숨기지만 `marketpulse://movers` route 자체를 막지 않는다. 직접 deep link하면 V2 문구/빈 화면은 열림. 서버 OFF gate 때문에 ranking/시장 스캔은 실행되지 않음 | V1 route 진입 guard/redirect. 정상 V1 화면 흐름의 기능 누출은 발견 못 함. 차단 아님 |
| L5 `server/src/daily-picks.mjs:62`, `today-focus.mjs:92,120` | **확정 범위 제약**. 보고서 미해석 후보 최대12, focus 최대20, news/top3 후보 첫8. 아홉 번째 종목의 중요한 뉴스는 점수 평가에 들어오지 않음 | 후보 기반 추천임을 명시; 비용과 균형 잡힌 후보 선택만 개선. 전체시장 순위라는 표현 금지. 차단 아님 |
| L6 `server/src/server.mjs:721–725` | **확정**. 일부 오류의 `error.message`가 detail로 응답되어 공급자/파일 경로를 노출할 수 있음. 읽기 키 보유자가 I/O/provider failure 유발 시 확인 가능 | 외부 generic error와 내부 log 분리. 키/전체 stack 노출 증거는 없음. 차단 아님 |
| L7 `server/src/naver-provider.mjs:99–137,393–400` | **확정 검증 부족**, 일반 UX 오발생 미확인. market은 6자리 code 형태로 추론, US route에도 숫자 6자리가 허용됨. `/api/stocks/US/005930`가 KR quote를 반환할 수 있음. 응답 종목 코드도 요청 code와 대조하지 않음 | market/code 조합 검증 및 공급자 code mismatch 거부. 일반 검색 UI의 KR/US code는 구분됨. 차단 아님 |

## V1 차단 경로 검증

| 요구사항 | 현재 코드 근거 / 판단 |
|---|---|
| 양쪽 플래그 기본 OFF | `server/src/config.mjs:28`, mobile hook와 tabs layout의 `=== 'true'` |
| 서버 monitor/receipt 비활성 | `server/src/server.mjs:732–737`에서 두 start 모두 gate. 생성자만으로 시작되지 않음 |
| 일반 화면 ranking 미호출 | `server.mjs:183–196` wrapper 진입부 OFF return. home/today-focus/engagement가 wrapper를 호출해도 provider까지 가지 않음. runtime home20 테스트에서도 ranking 0회 |
| idle timer/외부 요청 | production startup instrumentation에서 setInterval 0, 외부 fetch 0. 소스의 주기 timer는 OFF monitor 내부에만 있음 |
| Expo token | `mobile/src/hooks/use-push-notifications.ts:63–64` early return이 permission/token/listener보다 앞선다. module의 notification handler 설정 자체는 token 등록이나 네트워크 요청이 아님 |
| 급등 UI | tab href null; 설정 threshold controls 제거. L4 deep-link 예외는 남음 |
| 점수/문구/AI | daily-picks volume 가산은 false인 useVolumeRatio 뒤에 있음. movement-reason은 ratio 미사용. OpenAI evidence에 ratio 없음. 서버 AI 조건 ratio 분기도 OFF gate 뒤 |
| 상세 거래량 | raw volume 표시. 검증 안 된 N배 표시 없음 |

남아 있는 ratio DTO, V2 함수, authenticated push register/settings API의 존재만으로 V1 polling이라고 판단하지 않았다. 서버 OFF와 모바일 OFF를 **각각 배포 환경에서 확인**해야 한다. APK의 `EXPO_PUBLIC_*`는 빌드 시 결정되므로 서버 변수만 바꿔서는 기존 APK가 바뀌지 않는다.

## 시세·검색·캐시·장애 처리

- quote: 가격 없는/0/비정상 숫자 응답 거부. `tradeVolume`은 절대 거래량에만 사용. missing changePercent는 0 fallback이므로 공급자 필드가 사라진 날의 보합 표시 위험은 남는다. 거래시각이 없으면 빈 값이며 실시간 시각을 지어내지는 않는다. 미국 extended-hours 선택/실제 장중 필드 계약은 실응답 확인 대상이다.
- quote cache: market+전체 Naver code key, 30초, bounded 256 entries. 같은 URL 진행 중 요청은 finally 정리되는 Map으로 병합. 일반 KR/US code가 서로 다른 종목 캐시를 덮는 경로는 발견 못 함. TTL 시작이 fetch 이전이라 느린 요청에서는 유효기간이 더 짧아질 뿐이다.
- history: 정규화 날짜를 기준으로 정렬/중복 제거. 90초 cache. news는 5분. malformed/error-shaped non-empty 자료를 성공 빈 값으로 cache하는 것에 대한 기존 테스트를 현재 소스에서 다시 실행했다.
- 검색: trim/lowercase query key, 6시간, bounded cache. 정상 빈 배열만 negative cache; error-shaped/unknown non-empty 응답은 throw. 지원하지 않는 국가의 결과만 있는 검색은 결과 없음 대신 공급 오류로 처리될 여지는 있다. 개인용 정적 종목 식별에 6시간은 합리적이다. 재시작 cache 소실은 요청 증가이지 persistence 손실이 아니다.
- 관심종목 concurrency 6, V2 volume history concurrency 5. V1은 후자를 실행하지 않는다. report-only resolution은 최대12개 병렬, daily news는 최대8개 병렬이다.
- 홈 calendar 전체 실패는 PARTIAL, 상세 quote 실패는 오류, history/news 개별 실패는 availability로 빈 결과와 구분. 상세 calendar만 M2처럼 누락된다. DEMO_MODE를 명시적으로 켜지 않는 production에서 sample fallback을 정상 LIVE로 숨기는 일반 경로는 발견 못 했다.
- 홈 refresh와 watchlist load/search generation, stock/report detail focus guard가 늦은 응답의 최신 화면 덮기와 blur 후 read/view 기록을 막는다. 설정은 이제 alert GET/POST 자체가 없고 AI status load만 있다. L1처럼 모든 mutation/UI transient state까지 완결된 것은 아니다.
- 내부 PDF는 signed link; 외부 HTTPS pdfUrl은 직접 반환하므로 외부 host에 app key를 보내지 않는다. Linking 실패 메시지는 존재한다. PDF 버튼 자체의 async completion은 상세 load와 같은 lifecycle guard가 없어 이동 후 옛 PDF 열기/메시지가 생길 수 있는 경계는 남는다(`report/[id].tsx:123–136`).

## 인증·파일 저장·보고서

- production API key 공백 거부, publisher 공백/동일 key 거부. `/api/*` 공통 인증 뒤 privileged writes는 publisher 검사. app key로 report publish/PDF upload/delete/manual calendar write 거부하는 실제 HTTP 테스트 통과.
- 서명 예외는 PDF GET에 제한. HMAC, hex signature 길이, timing-safe 비교, expiry/path binding, 변조/만료/다른 path/서명으로 write 시도 거부 테스트 통과. 서명은 TTL 내 재사용 가능하며 one-time URL이 아니다. 앱 키는 원래 PDF 읽기 권한이 있으므로 개인용에서 서명 생성 비밀과 공유되는 것 자체를 권한 상승으로 보지 않았다.
- rate limiter는 socket address 기준, 240/min, bounded map. Railway proxy 아래 여러 요청이 같은 bucket을 쓸 가능성은 남지만 XFF 위조로 무제한 우회시키지 않는다. 공개 health는 `{ok:true}`뿐이다.
- APK app key 추출 시 시세/보고서/PDF 읽기, 관심/활동 변경, 일일 AI budget 소비가 가능하다. publisher/OpenAI key는 모바일에 포함되지 않는다. 비공개 APK 배포 통제와 키 교체로 관리할 잔여 위험이며 이 이유만으로 출시 차단하지 않는다.
- JSON store는 full-file 읽기/쓰기, 파일 경로별 프로세스 전역 queue라 두 store instance도 직렬화된다. ALS nested lock의 active lease가 종료 후 자식 작업에 남는 권한을 차단한다. 현 호출 경로의 report-op→store lock 순서에서 deadlock을 발견하지 않았다. 같은 held lock 아래 Promise.all로 중첩 쓰기를 fork하는 미래 호출은 안전하지 않으며 현재 helper 주석도 이를 금지한다.
- temp `wx`, 0600, 파일 fsync, rename, Linux directory fsync. partial write가 원본 JSON을 truncate하는 구조는 아니다. abrupt kill은 temp 고아를 남길 수 있다. rename 이후 directory sync 오류는 응답 실패여도 저장이 이미 반영된 상태일 수 있다. process가 여러 개면 이 in-memory lock은 충분하지 않다.
- 보고서 400개 제한/자동 삭제 없음. same-ID upsert/PDF 유지, report GET/read-state의 Naver 독립성 확인. uploader는 publisher key 사용. 저장 API는 08:00/08:50 자동 생성기가 아니며 기존 외부 게시 작업의 실행/재시도는 별도 운영 확인 사항이다.
- 2개/일이면 730개/년. **PDF 평균 1MB 가정 시 약730MB/년, 5MB이면 약3.65GB/년**이다. 실제 크기를 재야 하며 JSON보다 PDF가 먼저 Volume 한도를 채울 가능성이 높다. JSON은 전체 파일 반복 parse 비용이 장기적으로 늘지만 개인 1년 규모에 즉시 DB 변경 근거는 없다.
- 권장 보존: 용량 경고, 보고서 manifest/checksum과 PDF의 외부 백업, 복원 연습, 필요 시 조회 가능한 외부 archive. 자동 오래된 보고서 삭제는 권장하지 않는다. 25MB PDF buffer 제한 안에서도 signed-link 존재 확인이 PDF 전체를 읽고 download가 다시 읽으므로 대형 PDF에 stat/stream 최적화는 가능하다.

## AI

`server/src/openai-analysis.mjs`는 Responses `/v1/responses`, `text.format=json_schema`, strict schema/additionalProperties false/required 필드를 사용한다. reasoning low/standard, max_output_tokens 450. [공식 Terra 모델 문서](https://developers.openai.com/api/docs/models/gpt-5.6-terra)는 low reasoning 및 Structured Outputs를 지원한다. 실제 계정에서 모델 접근과 응답 성공은 별도 검증해야 한다. 적은 output cap에서 reasoning/incomplete가 발생하면 fallback으로 가며 성공 분석이 보장되지는 않는다.

OpenAI key가 없으면 정상 rule-based fallback. budget는 파일 lock+reserve로 동시성 제어하고 기본 하루12회, 재시작에도 저장된다. 실패 호출도 예약을 소비한다(과금 상한 보호 측면의 보수적 정책). 결과 캐시6시간은 evidence 전체 hash라 changePercent/뉴스/문구 변화에 민감하다. M6 외에 인증 없이 예산을 소진하는 정상 API 경로는 발견하지 않았다. 입력 evidence는 가격 변화/뉴스/일정/규칙 문구이며 unverified ratio는 없다. 실제 주가의 인과관계를 확정할 수 있다는 뜻은 아니다.

## Serverless와 요청량

Node 앱 코드의 OFF 경로에는 주기 시장 scan, push receipt, telemetry polling, self request가 없다. **다만 Dockerfile:13–14에는 30초 주기의 loopback HEALTHCHECK 선언이 있다.** Railway가 이를 실행하는지, loopback을 sleep 판정에 포함하는지는 이 로컬 실행으로 검증하지 못했다. 따라서 “반드시 sleep 방해” 또는 “아무 health 요청도 없음” 어느 쪽도 단정하지 않는다. 실제 컨테이너/네트워크 로그에서 확인하고 계속 깨워 놓는다면 주기 probe를 제거하고 배포 healthcheck로 제한한다.

[Railway 공식 Serverless 문서](https://docs.railway.com/deployments/serverless)는 outbound 기반 idle 판정과 첫 요청 502 가능성을 설명한다. 실제 배포에서 sleep→wake를 확인해야 한다. volume persistence와 메모리 cache 유지 여부는 다른 문제이며, 프로세스 재시작 시 메모리 cache가 비워지는 비용으로 계산하는 것이 보수적이다.

cache가 전부 cold이고 report-only 추가 종목이 없을 때 홈 1회:

| 관심종목 | 현재가 | daily news | 일정 | 합계 |
|---|---:|---:|---:|---:|
| KR 10–20개 | 10–20 | 최대8 | BLS 1 | 약19–29 |
| 미국 포함 10–20개 | 10–20 | 최대8 | BLS 1 + Nasdaq 16 | 약35–45 |

실제 production-mode mock 계수는 KR20 = **29회**, 즉시 홈 재요청 = **추가0회**. 뒤이은 상세도 해당 basic quote를 재사용했다. report-only 미해석 ticker R개(최대12)는 검색+quote가 최대2R개 추가된다. 상세 history/news, M3의 잘못된 Nasdaq 추가 요청은 위 홈 추정에 포함하지 않았다.

10번 모두 새 프로세스/cold cache라고 보수적으로 계산하면 홈만 약190–450 GET/일(+report-only/상세). 2시간 내 살아 있는 cache에서는 일정, 5분 내에는 뉴스, 30초 내에는 quote 중복이 줄어든다. 20개에서 수차례 화면 전환은 합리적인 규모이며 CPU 연산은 주로 작은 JSON parse/정렬이다. 바이트 수/월 청구액/RSS는 실측하지 않았으므로 확정 금액을 제시하지 않는다. 캐시는 entry 수256으로 제한되어 key가 무한 증가하지 않지만 response byte 크기 자체의 hard limit은 아니다.

가치 있는 최적화 순서는 M3(KR 불필요 Nasdaq), M4(동시 동일 일정), M2(품질을 보존하는 cache), M6(동일 AI 요청)이다. 현재가 TTL을 몇 분으로 늘려 정확도를 희생하거나 Redis/DB를 추가할 근거는 없다. 탭 focus마다 홈 GET은 다시 하지만 서버 cache를 이용하므로 매번 전체 외부 다운로드는 아니다.

## 추가 실환경 검증

- EAS **preview** profile은 APK, production profile은 AAB. preview 환경에 실제 HTTPS base URL/app key/급등 OFF/demo OFF가 주입되는지 확인. Hermes export 성공은 설치 가능한 서명 APK 생성 성공과 다르다.
- Android 실제 설치/재실행, A→B 빠른 이동, airplane mode와 네트워크 복귀, cold-start 첫 GET, 외부 PDF viewer, signed URL 만료/앱 복귀. FCM은 V1 출시 조건 아님.
- Railway `/data` 실제 Volume mount/쓰기 권한/재배포 후 지속성, 1 replica와 1 Node process, idle sleep/wake, HEALTHCHECK 효과, 로그의 불필요 주기 egress, RSS/CPU/egress/Volume 용량.
- 한국/미국 장중 actual quote 가격·시각·단위, Naver 응답 변경과 Nasdaq/BLS 접근 가능성. V2 ratio의 단위/분모 계약은 미검증 상태 그대로 두며 V1 근거로 사용하지 않는다.
- 실제 OpenAI 계정 Terra 응답/timeout/budget persistence. 08:00/08:50 외부 게시 automation의 cold-start POST 실패 재전송과 원문 백업/복원.

## 최종 여섯 항목

1. **새 Critical/High:** 확정 발견 없음. Medium M1–M9, Low L1–L7 및 lifecycle 경계를 상세 기록했다.
2. **급등 V1 제외:** 정상 UI/홈/서버 자동 실행 경로에서는 제외. raw V2 deep-link 화면은 남지만 scan/token 등록을 재활성화하지 않는다.
3. **Serverless 방해:** 앱의 주기 작업 없음. Docker HEALTHCHECK의 Railway 실제 동작은 확인 필요.
4. **하루10회·10–20종목:** 요청량 구조는 합리적. KR 상세 Nasdaq과 일정 중복만 우선 줄일 가치가 있다.
5. **개인용 APK 베타:** 가능. M1/M2 등은 정식 V1 전에 우선 보완 권장. 사적 사용 조건의 무제한 안전 보장은 아님.
6. **실환경 전용 검증:** Railway sleep/Volume, EAS native APK, Android 네트워크/PDF, 실제 시장 공급 응답/선택형 Terra/외부 보고서 게시.

**최종 상태: 개인용 APK 베타 가능**
