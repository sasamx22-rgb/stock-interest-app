# 출시 전 코드 리뷰 — Market Pulse

대상: `sasamx22-rgb/stock-interest-app`, `chatgpt/live-naver-market-data`.
원본 커밋: `d7892ac079465bb75c9327dea160a4a8a015aee9`.
아래 위치는 **수정 전 커밋** 기준이다. 수정 후 줄 번호와 다를 수 있다.

판정: **현재 상태로 개인용 실서비스 출시 보류**. APK 번들링은 가능하지만 개인 데이터 조회 보호, 시세/거래량 신뢰성, 전체 시장 탐색 범위, 보고서 보존, 실제 원격 푸시 준비가 남아 있다.

## 검토와 검증 범위

서버 전체 모듈, 모바일 라우트·훅·API 계층·타입·컴포넌트, 저장 모듈, 테스트, Docker/Compose, GitHub CI, Expo/EAS 설정, package manifests/lockfile 및 업로드 스크립트를 검토했다.

- 원본 서버 테스트: 39개 통과.
- 추가 회귀 테스트: 10개. 수정 후 전체 49개 통과.
- 실제 재현: 동시 읽음 저장 20개 중 1개만 보존, 배당 이벤트만 있을 때 TypeError, 푸시 실패 후 재시도 누락, 200종목 푸시 payload 용량 초과.
- `npm ci --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, `npm run lint` 성공.
- `expo export --platform android` 성공: 1,316 modules, Hermes bundle 약 2.9 MB. APK 네이티브 빌드 성공을 의미하지 않는다.
- 실행 검증 환경은 Node 24.19.0. 배포/CI의 Node 22.13 환경과 Docker 실행은 미검증(Docker 미설치).
- Railway 계정/볼륨, EAS 계정/빌드 환경변수, Firebase 자격증명, Android 실기기에는 접근하지 않았다.
- 네이버 실제 API 조회는 시간 초과/접근 실패. 현재 payload 필드 단위와 장중 최신성을 확인하지 못했다. 테스트 fixture는 실제 응답 계약의 증거가 아니다.
- 현재 소스의 대표적인 API 키/개인키 패턴 점검에서 발견 없음. Git 전체 이력, 배포 비밀값, 완성 APK를 검사한 것은 아니다.

“수정”은 이 리뷰의 변경 브랜치에 반영했다는 뜻이며 운영 배포 완료라는 뜻이 아니다. “조건부”는 코드 경로는 확인했지만 실제 운영 설정에 따라 발생 여부가 달라진다는 뜻이다.

## Critical

### C1. 공개 서버에서 키가 비어 있으면 모든 쓰기·삭제가 허용됨 — 조건부 / 부분 수정

- 위치: [server/src/server.mjs:68–77](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/server.mjs#L68), `server/src/config.mjs:29`, `compose.yaml:12`.
- 원인: 키 미설정 시 `requireWriteAccess()`가 바로 반환한다. Compose 기본값도 빈 문자열이다. 인터넷에 노출된 상태라면 누구든 보고서 삭제, 관심종목 변경, 자신의 푸시 토큰 등록, 최대 25 MB PDF 업로드를 할 수 있다.
- 재현: 원본 서버를 키 없이 시작하고 인증 헤더 없이 `POST /api/watchlist` 또는 테스트 보고서의 `DELETE /api/reports/{id}` 호출. 실제 운영 데이터에 파괴적 재현을 하지 않았다.
- 수정: production에서 키가 없으면 시작을 거부하도록 변경하고 프로세스 테스트를 추가했다. 로컬 개발 무키 모드는 유지했다. Railway에 충분히 긴 키와 `NODE_ENV=production` 설정을 확인해야 한다. Dockerfile은 이미 production을 설정한다.

## High

### H1. 키가 있어도 개인 보고서·PDF·활동·관심종목 및 AI 호출이 공개됨 — 확정 / 미수정

- 위치: [server/src/server.mjs:302–343](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/server.mjs#L302), `:274–300`, `:407–416`, `:436–510`; `mobile/src/lib/market-api.ts:21–44`.
- 원인: 인증은 쓰기 라우트에만 있다. 종목 상세 GET은 조건 충족 시 유료 AI 보강까지 실행한다. 일일 한도가 있어 무제한 과금은 아니지만 제3자가 한도를 소진시킬 수 있다. `EXPO_PUBLIC_API_KEY`는 APK에 들어가는 공유키이므로 기기에서 추출 불가능한 비밀로 취급해서도 안 된다.
- 재현: 서버 키를 설정해도 헤더 없이 `/api/reports`, `/api/reports/{id}/pdf`, `/api/review/weekly` 조회 가능. AI는 서버 키/조건이 맞으면 종목 상세 GET 반복으로 호출 예산을 소비한다.
- 수정안: 개인 API 전체 인증, 요청량 제한, 기기용 자격과 보고서 게시용 자격 분리. PDF는 인증 다운로드 또는 짧은 유효기간의 서명 URL 사용. GET에 무조건 인증만 넣으면 현재 `Linking.openURL` PDF 열기가 깨지므로 다운로드 경로까지 함께 수정해야 한다. 이 변경은 이번 부분 패치에 포함하지 않았다.

### H2. JSON 동시 저장으로 업데이트 유실·부분 파일 읽기·파일 손상 — 확정 / 단일 프로세스 수정

- 위치: [server/src/watchlist-store.mjs:41–99](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/watchlist-store.mjs#L41), `engagement-store.mjs:33–78`, `report-store.mjs:75–133`, `push-token-store.mjs:16–85`, `calendar-event-store.mjs:53–88`, `alert-settings-store.mjs:39–74`, `ai-budget-store.mjs:21–57`.
- 원인: 같은 파일을 각 요청이 읽고 수정한 뒤 직접 `writeFile`한다. 단일 Node 이벤트 루프도 파일 I/O의 요청 간 교차 실행을 막지 않는다. AI reserve의 자체 큐도 일반 읽기나 별도 인스턴스까지 보호하지 않는다.
- 재현: 동일 engagement 파일에 `Promise.all`로 서로 다른 보고서 20개 읽음 기록. 실제로 1개만 남았다. 쓰는 중 읽기는 빈/불완전 JSON을 볼 수 있다.
- 수정: 경로별 재진입 가능한 큐로 초기화·읽기·수정 전체 직렬화, 임시 파일에 쓰기→fsync→rename. PDF도 원자적 교체. 두 Store 인스턴스 동시 요청 회귀 테스트 통과.
- 한계: **한 Node 프로세스만 지원**. 여러 replica/프로세스의 공유 파일 접근 및 보고서 메타데이터와 PDF 사이 트랜잭션은 해결하지 않는다(H12 참고). 기존 손상 데이터도 자동 복구하지 않는다.

### H3. 잘못된 Host 헤더가 처리되지 않은 예외로 서버를 종료시킬 수 있음 — 확정 / 수정

- 위치: [server/src/server.mjs:183–195](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/server.mjs#L183).
- 원인: 요청 Host를 이용하는 `new URL()`이 try 밖에 있다. async HTTP 핸들러 rejection이 처리되지 않는다.
- 재현: Node 서버에 직접 `Host: [invalid` 요청. 원본 경로는 URL 생성 단계에서 throw한다. Railway 프록시가 이 헤더를 허용하는지는 미검증이다.
- 수정: 고정 기준 origin을 사용하고 URL 파싱을 try 안으로 이동했다. 잘못된 Host를 포함한 실제 로컬 HTTP 요청이 정상 처리되는 테스트를 추가했다.

### H4. 서버 장애가 가짜 현재가·샘플 보고서로 바뀌고 LIVE로 표시됨 — 확정 / 미수정

- 위치: [mobile/src/lib/market-api.ts:51–91](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/mobile/src/lib/market-api.ts#L51), `:153–202`, `:277–314`; `mobile/src/app/(tabs)/index.tsx:110–114`; `server/src/server.mjs:50–53`.
- 원인: 네트워크 오류·404·파싱 실패를 sample 데이터로 대체한다. LIVE 표시는 연결 성공 여부가 아니라 URL 환경변수 존재 여부다. 서버도 새 보고서 파일을 샘플로 초기화한다.
- 재현: APK의 API URL을 설정하고 서버를 끄면 예시 주식 가격이 표시되면서 홈은 LIVE DATA를 표시한다. 삭제된 보고서 ID가 샘플 ID와 같으면 상세 fallback에서 다시 나타난다.
- 수정안: 명시적 데모 모드에서만 샘플 허용. 실서비스에서는 오류/최종 정상 캐시/데이터 시각을 구분하고 실패를 최신 데이터로 표시하지 않는다. 서버 production의 초기 보고서도 빈 목록으로 시작해야 한다.

### H5. 빈/변경된 네이버 응답이 0원짜리 정상 시세로 수용됨 — 확정 / 부분 수정

- 위치: [server/src/naver-provider.mjs:5–9](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/naver-provider.mjs#L5), `:61–106`, `:123–151`.
- 원인: 가격 필드가 없으면 0, 빈 문자열도 `Number('')`로 0이 된다. 시각이 없으면 현재 시각, 출처는 항상 naver다. payload의 오류 상태나 전체 스키마를 검사하지 않는다.
- 재현: `normalizeBasicQuote({}, '005930')`, `{closePrice:''}`를 전달하면 원본은 정상 객체를 반환한다.
- 수정: 유효한 양수 가격이 없는 기본 시세는 거부하고 잘못된 ranking row는 제외한다. 빈 문자열을 숫자 0으로 처리하지 않는다. 원본 거래 시각, 등락률, 전체 payload 계약과 부분 실패 상태 검증은 추가로 필요하다.

### H6. 거래량 보조 계산이 저장된 알림 기준 및 거래 세션과 불일치 — 확정 / 부분 수정

- 위치: [server/src/naver-provider.mjs:371–408](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/naver-provider.mjs#L371), `server/src/server.mjs:128–144`.
- 원인: 보조 계산은 5%·3배에 고정되어 설정 3% 또는 5배 등이 반영되지 않는다. 첫 이력 행이 오늘이라고 가정해 제외하고, 현재 거래량이 없어도 첫 이력 행(어제일 수 있음)을 현재값으로 사용한다.
- 재현: 상승률 4%, 설정 3%, 거래량 배수 0인 후보는 이력 계산이 생략된다. 오늘 거래량 800, 직전 3일 300/100/200이면 원본은 300을 제외해 5.33배, 올바른 3일 평균 기준은 4배다.
- 수정: 실제 저장된 rule을 전달하고 시세 세션보다 이전인 이력만 평균에 포함한다. 현재 거래량이 없으면 같은 세션의 행만 사용할 수 있다. 회귀 테스트 통과.
- 한계: 이는 **현재 누적량 / 과거 일간 거래량 평균**이다. 전일 동시간대 대비 급증률이 아니다. 공급자 비율과 `Math.max`로 혼합하는 의미 및 네이버 시각 필드의 시간대 계약은 여전히 검증해야 한다.

### H7. 네이버 비율 필드의 %와 배수 혼동 가능성 — 추측·실데이터 미검증 / 미수정

- 위치: [server/src/naver-provider.mjs:90–97](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/naver-provider.mjs#L90), `:141–148`.
- 원인: `volumeRatio`, `quantRate`, `volumeIncreaseRate`, `compareToPreviousTradingVolumeRatio`를 같은 단위로 취급하고 `%`도 문자만 제거한다. 각 필드의 실제 의미·단위가 다르다면 오탐한다.
- 재현: 입력 비율이 문자열 `300%`이면 현재 파서는 300배로 반환한다. **현재 네이버가 해당 필드에 이 형식/의미를 준다는 사실은 확인하지 못했다.** 테스트의 `quantRate:'3.41'`만으로 실제 배수라고 결론 낼 수 없다.
- 수정안: KR/US 실응답을 날짜·장 상태별로 확보하고 필드별 단위 변환 및 비교 기준을 고정한다. 300%가 전일 대비 총량 비율인지 300% 증가율인지도 구분해야 한다. 확인 전 임의로 모든 ratio를 100으로 나누면 안 된다.

### H8. 한국·미국 전체 시장 감시 요구와 실제 후보 범위가 다름 — 확정 / 미수정

- 위치: [server/src/config.mjs:6–9](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/config.mjs#L6), `naver-provider.mjs:372–375`, `:453–465`.
- 원인: 국가별 첫 100개 ranking만 받는다. 한국은 거래량 급증 순위, 미국은 상승 순위이며 페이지 순회가 없다. 이력 보완도 합쳐서 첫 20개뿐이다.
- 재현: 상승률/거래량 조건을 만족하지만 후보 ranking 101위인 종목 또는 이력 계산이 필요한 21번째 후보는 탐지되지 않는다. 한국 후보가 앞의 20개를 차지하면 미국 후보가 보완에서 배제될 수 있다.
- 수정안: 전체 종목 커버리지가 있는 공급자 또는 페이지 순회·시장별 작업 큐·완료율 측정이 필요하다. 단순히 제한을 없애고 전체를 Promise.all로 호출하면 요청 폭주가 생긴다. 이번 패치는 임의로 감시 범위나 공급자를 바꾸지 않았다.

### H9. 푸시 실패 시 이벤트 유실, 요청 무응답 시 감시가 계속 잠김 — 확정 / 부분 수정

- 위치: [server/src/surge-push-monitor.mjs:25–58](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/surge-push-monitor.mjs#L25), `expo-push.mjs:52–81`.
- 원인: 전송 전에 `previousEligible`를 갱신한다. 전송이 실패해도 다음 poll에서는 신규가 아니다. Expo fetch에 timeout이 없어 멈추면 `inFlight`가 해제되지 않는다. 실패 ticket도 messages 개수로 전송 성공 집계한다.
- 재현: 기준 목록 [], 다음 목록 [A], 첫 send throw, 다음도 [A]이면 전송은 1번만 시도된다. 회귀 테스트로 확인했다.
- 수정: 전체 실패 시 기준을 유지해 다음 poll에서 재시도, 10초 timeout, 성공 ticket만 집계, 불완전 ticket 응답 거부.
- 남은 문제: 여러 기기 중 일부만 실패하면 기기별 재시도하지 않는다. timeout 직전 Expo가 접수했으면 재시도 시 중복될 수 있다. 프로세스 재시작에 견디는 outbox/멱등성·기기별 상태·receipt 확인이 필요하다. 감시 최초 baseline으로 기존 종목을 알리지 않는 동작은 README에 명시되어 있어 버그로 분류하지 않았다.

### H10. 많은 급등 종목이 발생하면 Expo push payload 초과 — 확정 / 수정

- 위치: [server/src/expo-push.mjs:29–47](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/expo-push.mjs#L29).
- 원인: 본문은 3종목만 보여주지만 data.symbols에 전체 alert를 넣는다. 100개씩 나누는 것은 수신기 메시지 개수 제한이며 개별 메시지 크기 제한을 해결하지 못한다.
- 재현: 200종목으로 메시지를 만들면 4 KB를 넘는다. 실제 Expo로 발송하지 않고 직렬화 바이트 크기로 재현했다.
- 수정: payload의 종목 미리보기를 3개로 제한하고 문자열 길이 및 전체 종목 수를 담는다. UI는 원래 movers 화면으로 이동하므로 구조 변경 없이 동작한다. 회귀 테스트 통과.

### H11. 배당/기타 일정만 있고 뉴스가 없으면 종목 상세 502 — 확정 / 수정

- 위치: [server/src/movement-reason.mjs:84–112](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/movement-reason.mjs#L84).
- 원인: dividend는 CATEGORY_RULES에 없고 dominant가 일치하지 않으면 representativeEvent와 representativeNews가 모두 undefined가 된다. `representative.title` 접근에서 throw한다.
- 재현: 뉴스 [], 이벤트 [{type:'dividend', title:'Example 배당락'}]. 실제 TypeError 확인.
- 수정: 뉴스가 없을 때 첫 유효 이벤트를 대표 근거로 사용하도록 보완. 회귀 테스트 통과.

### H12. PDF 업로드/삭제/요약 재게시 사이 일관성 오류 — 확정 / 미수정

- 위치: [server/src/server.mjs:346–380](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/server.mjs#L346), `report-store.mjs:110–121`, `scripts/publish-report.mjs:32–58`.
- 원인: PDF 업로드는 보고서를 먼저 읽고, 업로드 완료 후 오래된 객체로 upsert한다. 파일별 잠금만으로는 이 흐름 전체를 보호하지 못한다. 요약 upsert도 이전 pdfUrl을 보존하지 않는다.
- 재현: 큰 PDF POST 도중 같은 보고서 DELETE 또는 요약 수정 → 삭제 보고서 부활/수정 내용 되돌림 가능. PDF 저장 후 동일 ID 요약만 재게시 → pdfUrl이 빠져 PDF 버튼 비활성화, 파일 자체는 남음.
- 수정안: 보고서 ID별 전체 작업 직렬화와 메타데이터 최신값을 이용한 부분 갱신, 임시 PDF/커밋 절차. pdfUrl 생략 시 유지와 명시적 삭제를 구분한다. 영구 DB/객체 저장소 도입 시에도 두 객체의 실패 복구가 필요하다.

### H13. “계속 모이는 라이브러리”가 400개 이후 조용히 잘림 — 확정 / 미수정

- 위치: [server/src/report-store.mjs:4](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/report-store.mjs#L4), `:90–102`; `report-pdf-store.mjs:21–45`.
- 원인: 최신 400개만 JSON에 저장하고 제거된 메타데이터의 PDF는 정리하지 않는다. 장기적으로 보고서는 사라지는데 PDF 디스크는 계속 증가한다.
- 재현: 서로 다른 ID의 보고서 401개를 순서대로 저장 → 가장 오래된 보고서 조회 불가. 해당 PDF는 별도 delete를 하지 않으면 남는다. 하루 두 보고서면 400개 한도는 200회 작성일 분량이다.
- 수정안: 보고서를 삭제하는 대신 전체 보존+목록 페이지네이션/아카이브. PDF 참조 무결성 검사와 디스크 사용량 제한·백업. 사용자 허락 없이 보관 정책을 바꾸어 오래된 자료를 삭제해서는 안 된다.

### H14. Railway 영구 볼륨 및 Android FCM 배포 연결 미확인 — 조건부 / 설정 확인 필요

- 위치: [Dockerfile:7–9](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/Dockerfile#L7), `compose.yaml:18–23`, `mobile/app.json:10–20`, `mobile/src/hooks/use-push-notifications.ts:41–51`, `mobile/eas.json:11–24`.
- 원인: `/data` 환경변수는 영구 볼륨을 생성하지 않는다. Compose의 볼륨 선언이 Railway 설정을 대신하지 않는다. app.json에는 EAS projectId와 android.googleServicesFile이 없다. 코드의 `Constants.easConfig` 대체 경로가 있으므로 프로젝트 ID가 런타임에도 없다고 단정할 수는 없다. 저장소에는 FCM/EAS 외부 설정 완료 증거가 없다.
- 재현: 볼륨 없는 새 컨테이너 배포 → 보고서/관심종목/읽음/토큰/AI 예산 초기화. projectId 없는 설치본 → 토큰 등록 생략. Android FCM 설정 없는 설치본 → 토큰 발급/전송 오류 가능.
- 수정안: Railway `/data` 영구 마운트, 단일 replica, 백업과 재배포 후 읽기 테스트. EAS 프로젝트 연결, Firebase Android 패키지 일치, google-services.json 연결 및 EAS FCM v1 서버 자격 설정. **서비스 계정 개인키를 앱에 넣지 않는다.** preview 환경에 HTTPS API URL/앱용 키를 설정하고 APK를 다시 빌드한다. production 프로필의 AAB는 직접 설치용 APK가 아니며 현재 preview 프로필은 올바르게 APK로 설정되어 있다.

## Medium

### M1. TTL 캐시 키 무제한 증가 및 동시 cache miss 요청 증폭 — 확정 / 부분 수정

- 위치: [server/src/naver-provider.mjs:308–342](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/naver-provider.mjs#L308), `:354–428`, `economic-calendar-provider.mjs:189–285`, `openai-analysis.mjs:46–47,145–169`, `server.mjs:211–245`.
- 원인: TTL 만료 여부만 검사하고 과거 키를 삭제하지 않는다. 종목/날짜/관심종목 조합/AI 시세 조합에 따라 키가 늘어난다. 아직 응답이 오지 않은 동일 요청도 공유하지 않는다. watchlist는 최대 80개의 시세를 동시에 요청하고 calendar는 최대 16개 Nasdaq 요청을 병렬 발행한다.
- 재현: 매일 또는 다른 종목으로 조회하면 기존 Map 키가 남는다. 빈 캐시에서 같은 홈/상세를 동시에 요청하면 외부 조회가 중복된다. 감시는 토큰이 없어도 24시간 2분마다 실행된다. 정상 응답이고 매 회 캐시가 만료되면 ranking만 약 1,440회/일, 이력 20개가 매 회 필요하면 추가 약 14,400회/일이다. 실측치가 아니라 코드 기준 산술치다.
- 수정: 캐시별 최대 256항목을 보존하도록 제한. 미완료 Promise 공유, 외부 요청 동시성 제한, backoff, 캘린더 원천 응답 재사용, 장 상태에 맞춘 polling은 남아 있다. 메모리 누수의 키 증가 경로는 막았지만 부하가 해결됐다는 의미는 아니다.

### M2. JSON 요청 chunk 사이 한글 바이트가 잘리면 문자열 손상 — 확정 / 수정

- 위치: [server/src/server.mjs:109–126](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/server.mjs#L109).
- 원인: Buffer chunk마다 문자열로 변환해 연결한다. UTF-8 한 글자의 바이트가 두 chunk에 걸치면 대체문자로 바뀐다. JSON 문법은 유효해 손상된 종목명/보고서가 그대로 저장될 수 있다.
- 재현: 한글 JSON을 1바이트씩 yield하는 입력 스트림으로 전달한다.
- 수정: 바이트 크기 제한을 적용해 Buffer로 합친 뒤 한 번만 UTF-8 decode. 내용 보존 및 413 회귀 테스트 통과.

### M3. 모바일 응답 순서 경쟁으로 다른 시장/오래된 상태 표시 — 확정 / 부분 수정

- 위치: [mobile/src/app/(tabs)/movers.tsx:22–43](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/mobile/src/app/%28tabs%29/movers.tsx#L22), `watchlist.tsx:35–92`, `index.tsx:60–81`, `settings.tsx:81–116`, `stock/[market]/[code].tsx:51–71`, `report/[id].tsx:24–42`.
- 원인: 요청 세대 확인이 없는 화면이 있다. 상세 화면은 파라미터 변경 때 이전 ready 데이터를 지우지 않고, active 확인 전에 읽음/조회 기록을 전송한다. watchlist는 한 pendingKey로 여러 동시 작업을 표현한다.
- 재현: KR 응답을 늦추고 US로 전환해 US→KR 순으로 응답시키면 US 선택 상태에 KR 목록이 남는다. 검색 A→B의 응답을 반대로 도착시켜도 비슷하다. 상세 파라미터 변경 중 이전 문서/종목이 표시될 수 있다.
- 수정: movers는 요청 세대·focus cleanup으로 이전 응답을 버리고 시장 전환 시 이전 목록과 시각을 비운다. 다른 화면에는 동일한 취소/세대 처리, 자원 ID를 포함한 상태, 작업별 pending 관리가 필요하다. UI 레이아웃은 변경하지 않았다.

### M4. 모바일 요청 무기한 대기와 읽음 저장 실패 무시 — 확정 / 부분 수정

- 위치: [mobile/src/lib/market-api.ts:29–48](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/mobile/src/lib/market-api.ts#L29), `:123–142`.
- 원인: fetch timeout이 없고, 읽음/종목조회 저장 실패는 빈 catch로 버린다. 앱의 durable 로컬 큐/오프라인 저장소가 없다. 서버 영구 저장과 오프라인에서의 저장 보장은 다르다.
- 재현: 응답을 끝내지 않는 서버 연결 → 로딩/저장 상태 지속. 보고서를 내려받은 직후 네트워크를 끊으면 읽음 POST가 유실되어 재접속 시 NEW가 다시 보일 수 있다.
- 수정: 요청부터 응답 본문 수신까지 60초 timeout을 적용했다. 서버 상세 호출이 여러 외부 단계와 AI 25초를 포함해 여유를 둔 값이다. 읽음/조회 기록은 durable 재시도 큐와 실패 상태 표시를 별도로 구현해야 한다.

### M5. Expo receipt를 조회하지 않아 FCM 전달 실패를 감지하지 못함 — 확정 / 미수정

- 위치: [server/src/expo-push.mjs:66–82](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/expo-push.mjs#L66), `surge-push-monitor.mjs:48–58`.
- 원인: ticket을 받아도 ID를 저장하거나 getReceipts를 호출하지 않는다. ticket 성공은 Expo 접수이며 Android 전달 성공이 아니다. 자격증명 오류나 나중에 반환되는 DeviceNotRegistered를 놓친다.
- 재현: Expo send는 ok ticket, 이후 receipt는 FCM 자격 오류를 반환하도록 모의 실행. 현재 서버는 후속 조회 자체가 없다.
- 수정안: ticket ID↔token을 저장, 일정 시간 뒤 receipt 확인, invalid token 정리와 재시도 가능한 오류 분류. 재시작 후에도 이어질 outbox 필요. 실제 APK에서 정상·백그라운드·종료 상태 전달을 확인한다.

### M6. 종료 상태에서 알림 탭으로 이동하는 경로 누락 가능성 — 추측·실기기 미검증 / 미수정

- 위치: [mobile/src/hooks/use-push-notifications.ts:75–92](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/mobile/src/hooks/use-push-notifications.ts#L75).
- 원인: 실시간 response listener만 있고 초기 마지막 response 조회/useLastNotificationResponse가 없다. 리스너 등록 전에 전달된 cold-start 응답을 놓칠 수 있다. effect 등록과 native 이벤트 전달 순서에 따라 달라지므로 확정 결함으로 단정하지 않는다.
- 재현: APK 프로세스가 종료된 상태에서 알림을 눌러 시작하고 급등 탭 이동 여부를 확인한다. Android 설정의 강제 중지와 일반 프로세스 종료는 구분해야 한다.
- 수정안: 라우터 준비 후 초기 notification response 처리, ID 중복 방지, 처리한 response 정리. AppState 복귀 시 중복 토큰 등록 요청도 직렬화할 수 있다.

### M7. 가격 이력 정렬·중복 제거가 “최신 5개” 가정을 보장하지 않음 — 확정 / 미수정

- 위치: [server/src/naver-provider.mjs:198–241](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/naver-provider.mjs#L198), `mobile/src/app/stock/[market]/[code].tsx:74–86`.
- 원인: 응답을 재귀 순회한 순서대로 30개를 자르고 중복 키를 날짜+가격으로 만든다. 날짜별 중복/오름차순 응답이면 최근 가격 비교 방향 및 high/low가 틀릴 수 있다.
- 재현: 과거→최신 순서의 fixture 또는 같은 날짜의 가격이 다른 두 행을 전달하면 그대로 남는다. 현재 네이버 응답이 실제로 이런 순서라는 주장은 아니다.
- 수정안: 날짜 형식/거래일 검증→날짜별 중복 정리→내림차순→최대 개수 제한. 가격 5개 간 변화는 4개 구간이며 UI 문구도 실제 표본 수에 맞춰야 한다.

### M8. 수동 캘린더 800개 이후 미래 이벤트 저장 누락 — 확정 / 미수정

- 위치: [server/src/calendar-event-store.mjs:44–45](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/calendar-event-store.mjs#L44), `:64–88`.
- 원인: 날짜 오름차순 정렬 후 첫 800개를 보존한다. 오래된 데이터가 가득 차면 새 미래 이벤트가 잘리는데 upsert는 성공 객체를 반환한다.
- 재현: 과거 이벤트 800개 저장 후 미래 이벤트 추가 → 응답 성공, getAll에는 없음.
- 수정안: 과거 이벤트를 아카이브하거나 DB 페이지네이션. 한도를 유지한다면 저장 불가능을 명시적으로 반환해야 한다. 자동 캘린더는 별도 경로이므로 이 문제는 수동 저장에 해당한다.

### M9. AI 캐시가 시세 소폭 변동마다 무효화되어 예산을 빨리 소진 — 확정 / 부분 수정

- 위치: [server/src/openai-analysis.mjs:118–169](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/openai-analysis.mjs#L118), `:74–112`.
- 원인: 정확한 등락률·거래량·이를 포함한 규칙 문장을 모두 key로 쓴다. 뉴스가 같아도 가격이 움직이면 새 key다. 동일 시점 동시 요청도 in-flight 결과를 공유하지 않는다. 오류나 불완전 JSON 응답에도 reserve는 소비된다.
- 재현: 동일 뉴스·일정, changePercent만 2.01→2.02로 변경하면 두 번 호출한다. 반복하면 기본 12회 한도가 빠르게 소진된다.
- 수정: 키 개수 상한만 이번에 적용했다. 분석의 유효기간/중대한 변화 기준 및 in-flight dedupe가 필요하다. 실패 reserve를 무조건 환불하면 비용 상한을 약화시킬 수 있으므로 접수 여부를 구분해야 한다. 모델 ID는 공식 문서에서 확인했으며 존재하지 않는 모델이라고 분류하지 않았다. `reasoning.mode`, 계정 권한, 실제 structured output 계약은 유료 호출 없이 확인되지 않은 외부 연동 검증 항목이다.

## Low

### L1. 캘린더의 미정 발표 시각을 특정 시각으로 표시 — 확정 / 미수정

- 위치: [server/src/economic-calendar-provider.mjs:134–155](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/economic-calendar-provider.mjs#L134), `:249–251`; `mobile/src/app/(tabs)/calendar.tsx:28–34,118–125`.
- 원인: before/after/미정 텍스트를 08:00/16:30/12:00로 치환해 확정 시각처럼 표시한다. 화면은 21일을 요청하지만 기업 일정은 최대 8개 날짜만 조회한다. FOMC는 정적 목록이다.
- 재현: time 필드 없는 실적 row → 정오 시각 생성. 10일 뒤 기업 실적은 calendar 요청 범위에 들어도 원천 요청 자체가 없다.
- 수정안: 예상/미정 시각 표시, 원천별 수집 기간 안내, 정적 일정 갱신 절차. 지금 특정 FOMC 날짜가 틀렸다고 주장하는 것은 아니다.

### L2. 반복 열람으로 최초 읽음 날짜가 덮여 주간 집계 의미가 달라짐 — 확정 / 미수정

- 위치: [server/src/engagement-store.mjs:49–60](https://github.com/sasamx22-rgb/stock-interest-app/blob/d7892ac079465bb75c9327dea160a4a8a015aee9/server/src/engagement-store.mjs#L49), `engagement-service.mjs:58–60`.
- 원인: 같은 report ID를 열 때마다 readAt을 덮어쓴다. 최초로 읽은 보고서 수를 기대하면 과거 보고서 재열람이 이번 주 신규 읽음으로 계산된다. 최종 열람 기준 집계가 의도라면 버그가 아니라 문구 문제다.
- 재현: 지난주 읽은 보고서를 이번 주에 다시 열면 readAt이 이번 주가 되어 reportsRead에 포함된다.
- 수정안: firstReadAt/lastReadAt 구분 또는 최종 열람 기준이라는 문구 명시. 요구사항 의미를 임의로 바꾸지 않아 그대로 두었다.

## 변경본 적용 시 주의

- 기능이나 화면 배치를 추가/재설계하지 않았다. 데이터 저장, 파싱 실패 처리, 요청 종료 및 응답 순서를 중심으로 수정했다.
- production에서는 MARKET_PULSE_API_KEY가 반드시 있어야 한다. 키 없이 Docker를 시작하면 이제 의도적으로 실패한다.
- 파일 잠금은 단일 프로세스 범위다. replica를 늘리기 전에 DB 트랜잭션으로 전환해야 한다.
- `sent`는 이제 성공한 Expo 접수 ticket 수다. Android 수신 성공 수가 아니다.
- 보조 거래량 계산은 여전히 일간 평균 기준 추정이다. 공식 실시간 전시장 감시를 보장하지 않는다.
- 앱과 서버의 변경을 함께 검증한 뒤 배포해야 한다. 이 리뷰는 배포·병합·FCM 실발송을 수행하지 않았다.

## 공식 문서 확인

- [Expo 전송·ticket·receipt·오류 처리](https://docs.expo.dev/push-notifications/sending-notifications/): ticket은 접수 결과이며 receipt 확인이 필요하다. 큰 메시지는 MessageTooBig 오류 대상이다.
- [Expo Android FCM v1 설정](https://docs.expo.dev/push-notifications/fcm-credentials/): 앱 googleServicesFile 연결과 EAS 서버용 자격 설정이 각각 필요하다.
- [Railway Volumes](https://docs.railway.com/volumes): 컨테이너 경로 지정과 영구 볼륨 연결은 별개다.
- [GPT-5.6 Terra 공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-5.6-terra): 모델 ID 자체를 오류로 보지 않았다.

## 출시 전 반드시 해결할 체크리스트

아래는 위 모든 개선 제안이 아니라 출시 차단 또는 핵심 기능 신뢰성을 위해 필요한 항목이다.

- [ ] C1/H1: production 키 강제 적용 확인, 개인 읽기 API/AI 호출 인증, PDF 인증 경로와 요청량 제한.
- [ ] H2/H3/H11/M2: 저장 직렬화·원자적 쓰기, HTTP 예외·한글 파싱, 배당 일정 예외 수정본 병합 및 배포 환경 재검증.
- [ ] H4/H5: production 샘플 자동 대체/초기 데이터 제거 또는 명시적 구분, 유효하지 않은 시세를 정상 현재가로 표시하지 않기.
- [ ] H6/H7: 실제 KR/US 응답 fixture로 거래량 단위·세션·분모를 검증하고 설정한 알림 기준이 동일하게 적용됨을 확인.
- [ ] H8: 요청한 한국·미국 전체 시장 감시의 실제 커버리지 확보. 현행 ranking 일부 조회를 전체 시장이라고 간주하지 않기.
- [ ] H9/H10/M5: timeout·재시도·payload 수정 반영, ticket/receipt 및 실패 기기 처리 완성.
- [ ] H12/H13: PDF와 요약 갱신/삭제 일관성, 400개 이후 보고서 유실 없는 보존, 참조 없는 PDF와 디스크 증가 처리.
- [ ] H14: Railway 영구 볼륨/단일 replica/백업 및 재배포 후 데이터 복원 확인.
- [ ] H14/M6: EAS preview 환경과 Firebase/FCM 설정 후 실제 APK 설치, 정상·백그라운드·종료 상태 수신 및 알림 탭 이동 확인.
- [ ] M1: 캐시 상한 반영 및 동시 외부 요청 제한/중복 요청 합치기. 실제 배포에서 요청량·메모리 확인.
- [ ] M3/M4: 시장 전환 응답 역전 방지 적용, 핵심 읽음 상태의 저장 실패를 숨기지 않고 복구 가능하게 처리.
