# Market Pulse 출시 전 코드 리뷰 — Round 2

검토일: 2026-09-23 (KST)
검토 대상 코드 기준: `chatgpt/live-naver-market-data` @ `4e40f463197fe79991742d8baa670a4480be885c`

이 문서는 Astra 1차 리뷰를 병합하고 후속 수정한 뒤, 기존 결론을 그대로 전제하지 않고 서버·모바일·저장·푸시·배포 경로를 다시 검토한 결과다.

## 현재 판정

**코드 안정성은 크게 개선되었고 개인용 APK 베타 테스트 단계로 진행할 수 있다.**

다만 원래 요구사항인 **한국·미국 전체시장 급등 감시**와 **네이버 거래량 비율 필드의 실제 단위 검증**은 아직 완료되지 않았다. 따라서 현재 급등 탐지를 전체 시장을 빠짐없이 감시하는 완성형 실시간 알림으로 간주하면 안 된다.

또한 EAS/FCM 실제 APK, 백그라운드·종료 상태 푸시, 최신 Railway 배포의 영구 데이터 유지 여부는 실환경 검증이 남아 있다.

## 1차 리뷰 이후 해결된 주요 항목

### 보안·개인정보
- production에서 `MARKET_PULSE_API_KEY`가 없으면 서버 시작 거부.
- `/api/*` 전체 인증 적용. 유효한 signed PDF GET만 예외.
- 공개 `/health` 응답은 `{"ok":true}`로 최소화.
- PDF는 인증 후 5분짜리 HMAC 서명 URL을 발급해 열도록 변경.
- `MARKET_PULSE_PUBLISH_KEY`를 추가해 앱 키와 보고서 게시 관리자키를 분리 가능.
- 보고서 게시·PDF 업로드·보고서 삭제·수동 일정 등록은 publisher key 사용.
- 메모리 기반 요청량 제한 적용.

### 저장 안정성
- JSON 파일은 경로별 직렬화 + 임시 파일 + fsync + rename 방식.
- 보고서 400개 자동 절단 제거.
- 보고서 재게시 시 기존 `pdfUrl` 유지.
- 보고서 ID 단위 작업 lock으로 PDF 업로드·삭제·메타데이터 갱신 경쟁 완화.
- 수동 일정 800개 자동 절단 제거.
- 동일 보고서를 다시 읽어도 최초 읽음 시각 유지.

### 데이터 신뢰성
- 양수의 유효 가격이 없는 네이버 응답은 정상 시세로 취급하지 않음.
- 거래량 보조 계산에 사용자가 설정한 알림 기준 적용.
- 현재 거래 세션과 과거 세션을 구분하여 전일 거래량을 현재값으로 대체하지 않음.
- 가격 이력을 거래일 단위 중복 제거 후 최신순 정렬.
- production 장애 시 샘플 가격·샘플 보고서로 자동 대체하지 않음.
- 샘플은 `EXPO_PUBLIC_DEMO_MODE=true`인 명시적 데모에서만 사용.
- 홈·관심·급등·일정·보고서에서 연결 실패와 실제 빈 데이터를 구분.

### 푸시
- Expo send timeout 및 전체 전송 실패 재시도.
- 큰 push payload 제한.
- 성공 ticket ID와 token을 `/data`에 저장.
- 약 15분 뒤 Expo receipt 조회.
- receipt의 `DeviceNotRegistered` 토큰 자동 삭제.
- 앱 종료 상태에서 알림을 눌러 시작한 경우 last notification response 처리.
- 등록 기기 0대이면 2분 주기 네이버 급등 조회 자체를 생략.

### 요청량·캐시
- 캐시 항목 수 상한 추가.
- 동일 네이버 URL의 동시 in-flight 요청 합치기.
- 관심종목 시세 동시성 6개, 거래량 이력 보강 동시성 5개 제한.
- 모바일 요청 timeout 적용.

### 기타
- 배당 일정만 있는 종목 상세 TypeError 수정.
- 시장 전환 시 늦은 이전 응답이 새 화면을 덮는 문제 수정.
- 동일 ticker가 여러 오늘 보고서에 있으면 모든 reportId 유지.
- Nasdaq 실적 시간은 임의의 정확한 시각 대신 장전/장후/시간 미정으로 표시.

## 남은 High

### H1. 한국·미국 전체 시장 감시 요구사항 미충족 — 확정
현재 급등 후보는 KR/US 각각 네이버 ranking 첫 범위 `startIdx=0&pageSize=100`이며, 거래량 이력 보완도 조건 후보 중 최대 20개다. ranking 범위 밖의 종목은 조건을 충족해도 탐지되지 않을 수 있다.

필요 조치: 네이버 pagination 계약을 실응답으로 확인한 뒤 시장별 제한 동시성 queue로 순회하거나, 전체 종목 snapshot을 안정적으로 제공하는 데이터 공급자로 교체해야 한다. 검증 없이 pageSize를 크게 하거나 전 종목을 병렬 호출하면 안 된다.

### H2. 네이버 거래량 ratio 필드 의미·단위 미검증 — 검증 공백
현재 `volumeRatio`, `accumulatedTradingVolumeRatio`, `tradingVolumeRatio`, `quantRate`, `volumeIncreaseRate`, `compareToPreviousTradingVolumeRatio`를 동일한 배수 후보로 해석한다. 실제 필드별 의미가 퍼센트·총량비율·증가율로 다르면 오탐할 수 있다.

보조 계산 역시 현재 누적 거래량 / 과거 일간 거래량 평균이며 전일 동시간대 급증률과 동일하지 않다.

필요 조치: KR/US 장중 원본 payload를 확보해 fixture로 고정하고 단위·거래시각·세션을 검증해야 한다.

### H3. 실제 Android/EAS/FCM 전달 검증 미완료 — 외부 환경 검증
코드에는 ticket/receipt/cold-start 처리가 있으나 EAS preview APK, FCM v1 자격증명, foreground/background/종료 상태 수신, notification tap 이동, receipt 실결과는 실제 기기로 검증하지 않았다.

## 남은 Medium

### M1. 앱 API 키는 APK에서 추출 가능
`EXPO_PUBLIC_API_KEY`는 클라이언트 번들에 포함된다. publisher key 분리로 관리자 동작은 보호할 수 있지만 추출된 앱 키로 개인 조회 및 앱 수준 상태 변경은 가능하다. 개인용 APK를 비공개로 쓰는 전제에서는 수용 가능한 잔여 위험이나 공개 배포용 인증으로는 부족하다.

### M2. receipt 단계 오류의 persistent outbox/재발송 없음
Expo가 ticket을 성공으로 접수한 뒤 receipt에서 FCM 오류가 나면 오류 기록과 invalid token 제거는 하지만 원래 알림을 다시 보내는 persistent outbox는 없다.

### M3. 읽음/종목조회 기록 offline retry 없음
`markReportRead`와 `recordStockView`는 실패가 UX를 막지 않도록 무시한다. 네트워크 장애 시 NEW 상태나 주간 조회 기록이 일부 유실될 수 있다.

### M4. 등록 기기가 있으면 장 마감 후에도 2분 polling
기기 0대 polling은 제거했지만 하나 이상 등록되면 KR/US 장이 모두 닫힌 시간에도 후보 요청을 수행한다. Railway Free 비용과 요청량 측면에서 시장시간 gating이 유리하다.

### M5. 파일 저장은 단일 Node 프로세스 전제
현재 lock은 한 프로세스 안에서만 유효하다. Railway는 1 replica를 유지해야 하며 다중 replica 전환 시 DB가 필요하다.

### M6. 보고서 메타데이터와 PDF는 완전한 단일 트랜잭션이 아님
동시성 race는 크게 줄었지만 PDF write 성공 직후 metadata write에서 디스크/프로세스 장애가 나면 고아 PDF 같은 중간 상태가 가능하다. 자동 백업도 아직 없다.

### M7. 기업 일정 원천 조회 범위와 UI 기간 차이
UI는 21일 일정을 요청하지만 Nasdaq earnings/dividend 원천은 최대 첫 7일만 조회한다. 8~21일 뒤 기업 일정은 빠질 수 있다.

### M8. AI 캐시 키가 소폭 시세 변화에도 달라질 수 있음
뉴스/일정이 같아도 정확한 등락률·거래량 변화로 새 cache key가 생긴다. 하루 12회 상한으로 비용은 제한되지만 반복 상세 조회로 한도를 빨리 소진할 수 있다.

## Low / 운영 주의
- FOMC 일정은 정적 목록이므로 향후 연도 갱신 필요.
- 보고서/PDF 무기한 보존으로 장기간 사용 시 Railway Volume 용량·백업 정책 필요.
- in-memory rate limit은 서버 재시작 시 초기화된다.
- 네이버/Nasdaq 공개 웹 응답 변경을 운영 중 감시해야 한다.

## 검증 결과
- 최신 코드 기준 Server tests 통과.
- Mobile TypeScript 통과.
- Expo lint 통과.
- Docker build 통과.
- 중간에 report detail effect state reset이 lint에 걸렸으나 요청 ID 기반 상태로 수정 후 CI green.
- Railway `/data` volume mount와 기존 서버 기동은 실제 환경에서 확인됨.
- 네이버 KR/US watchlist 실조회와 보고서 API는 기존 배포에서 실제 확인됨.
- 최신 인증 강화 코드가 반영된 Railway 재배포와 EAS APK는 별도 실환경 재검증 필요.

## 개인용 베타 진행 조건
다음 조건이면 개인용 APK 베타 테스트를 진행할 수 있다.
1. 최신 CI green.
2. Railway `MARKET_PULSE_API_KEY` 유지.
3. 별도의 `MARKET_PULSE_PUBLISH_KEY` 설정 권장.
4. Railway `/data` volume + 1 replica 유지.
5. EAS preview APK 빌드.
6. FCM v1 연결 후 실기기 푸시 테스트.

다만 전체시장 커버리지와 거래량 ratio 단위가 검증되기 전에는 전체시장 급등 탐지가 요구사항을 완전히 충족한다고 판정하지 않는다.

## 다음 Astra 독립 재검토 요청사항
1. 이 문서의 해결 항목을 신뢰하지 말고 코드에서 독립적으로 재현할 것.
2. `requireApiAccess` / `requirePublishAccess` 우회 가능성과 signed PDF 만료/서명을 검토할 것.
3. report operation lock + ReportStore file lock의 deadlock/race를 검토할 것.
4. Expo ticket 저장 → receipt 조회 → token cleanup의 재시작 안정성을 검토할 것.
5. Naver in-flight dedupe와 concurrency limiter의 race/leak 여부를 확인할 것.
6. production에서 API 실패가 샘플 또는 LIVE 정상 상태로 오인되는 경로가 남아 있는지 찾을 것.
7. 가격이력 날짜/타임존 경계와 volume enrichment를 검토할 것.
8. cold-start notification response의 중복/누락 가능성을 검토할 것.
9. 최신 CI, Android Hermes export 및 가능하면 EAS APK build를 검증할 것.
10. 기존 1차/2차 보고서에 없는 신규 Critical/High를 저장소 전체에서 다시 탐색할 것.

## 외부 연동 메모
- Expo push ticket은 최종 기기 전달 성공이 아니므로 receipt 확인이 필요하다.
- receipt는 즉시가 아니라 일정 지연 후 확인해야 하며 현재 코드는 약 15분 후 확인한다.
- GPT-5.6 Terra Responses API + Structured Outputs + low reasoning 연동 방식은 현재 공식 API 문서와 호환되는 것으로 재확인했다.

