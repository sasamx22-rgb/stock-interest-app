# Market Pulse

개인용 Android 주식 관심도 앱입니다. 한국·미국 관심 종목, 급등/거래량 급증 신호, 오전 보고서와 프리마켓 보고서를 한곳에서 확인합니다.

## 현재 구현 범위

- 한국·미국 관심 종목 대시보드
- 앱에서 네이버 종목 검색 후 관심종목 추가·삭제
- 관심종목 서버 로컬 JSON 영구 저장
- 상승률 5% + 거래량 3배 알림 조건 표시
- 서버 2분 감시 + Android 원격 시스템 푸시
- 한국/미국 급등 종목 화면 + 수동 새로고침
- PDF 원문과 앱용 요약을 위한 보고서 보관함
- 네이버 시세 어댑터와 샘플 데이터 자동 대체
- Android APK용 EAS preview 프로필

> 네이버 증권에는 공식 시세 Open API가 없습니다. 이 프로젝트는 개인용 실험으로 설계되며, 네이버 응답 구조가 변경되면 어댑터 수정이 필요합니다. 표시 데이터는 투자 참고용입니다.

## 구조

```text
mobile/  Expo SDK 57 + React Native + Expo Router
server/  Node.js API + 교체 가능한 NaverMarketProvider
```

앱은 `EXPO_PUBLIC_API_BASE_URL`이 없거나 서버 연결에 실패하면 샘플 데이터로 실행됩니다. 서버와 연결하면 API 응답을 사용합니다.

## 관심종목 관리

앱의 **관심** 탭에서 한국·미국 종목을 검색하고 추가/삭제할 수 있습니다.

- 검색: 네이버 공개 종목 자동완성 응답 사용
- 저장 위치: `server/data/watchlist.json`
- 최초 실행: `WATCHLIST` 환경변수 값을 초기 관심종목으로 사용
- 이후 변경: 앱에서 추가·삭제한 상태를 JSON에 저장
- `server/data/`는 Git에서 제외되어 개인 관심종목이 저장소에 올라가지 않습니다.

시세 조회가 일시 실패해도 저장된 관심종목 자체는 유지됩니다. 홈 화면에는 현재 시세 조회에 성공한 항목이 표시됩니다.

## 급등 알림

서버는 한국·미국 급등 후보를 조회한 뒤 **상승률 5% 이상 + 거래량 3배 이상**을 동시에 만족한 종목만 `/api/alerts`로 제공합니다.

- 서버가 기본 2분 간격으로 신규 조건 충족 종목을 확인합니다.
- 서버 최초 조회는 기준 상태만 잡고, 이후 새롭게 조건을 충족한 종목만 등록된 기기로 원격 푸시합니다.
- 앱은 `expo-notifications`로 알림 권한을 받고 Expo push token을 서버에 자동 등록합니다.
- Android에서는 `급등 알림` 채널을 만들며 알림을 누르면 급등 탭으로 이동합니다.
- 앱이 백그라운드이거나 완전히 종료된 상태에서도 서버가 실행 중이고 EAS/FCM 자격증명이 정상이라면 시스템 알림을 받을 수 있습니다.
- 같은 급등 목록을 여러 화면에서 조회할 때 네이버에 중복 요청하지 않도록 서버에서 45초간 후보 목록을 캐시합니다.

## 네이버 데이터 연결

- 국내 관심종목은 네이버 모바일 국내종목 basic 응답을 사용합니다.
- 미국 관심종목은 `stock.naver.com`의 해외종목 basic 응답을 별도로 사용합니다.
- 국내 급등 탐지는 네이버의 거래량 급증 목록을 기본 후보군으로 사용합니다.
- 미국 급등 탐지는 네이버의 미국 상승 종목 목록을 기본 후보군으로 사용합니다.
- 급등 목록 응답에 거래량 배수 필드가 없으면 해당 종목은 거래량 3배 조건을 충족한 것으로 임의 판단하지 않습니다.

기본 급등 목록 URL은 서버에 내장되어 있으며, 네이버 응답 구조가 바뀌는 경우 아래 환경변수로 대체 URL을 지정할 수 있습니다.

## 로컬 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run server
```

별도 터미널에서:

```bash
cd mobile
EXPO_PUBLIC_API_BASE_URL=http://<개발-PC-IP>:8787 npx expo start
```


## Android 원격 푸시 준비

코드 경로는 연결되어 있지만 최초 실제 기기 테스트 전에는 Expo/EAS 쪽 프로젝트 및 Android 푸시 자격증명 설정이 필요합니다.

1. `cd mobile`에서 Expo 계정에 로그인합니다.
2. `npx eas-cli@latest init`으로 EAS 프로젝트를 연결합니다. 연결되면 EAS `projectId`가 빌드 구성에 제공됩니다.
3. Android용 FCM v1 자격증명을 EAS에 설정합니다.
4. `npx eas-cli@latest build --platform android --profile preview`로 APK를 새로 빌드합니다.
5. 기기에서 알림 권한을 허용한 뒤 앱의 **설정** 탭에서 등록 기기 수와 서버 푸시 감시 상태를 확인합니다.

Expo Push Service는 앱에서 얻은 `ExpoPushToken`을 서버가 Expo Push API로 전송하고, Expo가 FCM을 통해 Android 기기에 전달하는 구조입니다.

## Android APK

Expo 계정으로 로그인한 뒤 다음 명령을 실행합니다.

```bash
cd mobile
npx eas-cli@latest build --platform android --profile preview
```

`preview` 프로필은 직접 설치 가능한 APK를 생성합니다. Android 원격 푸시는 Expo Go가 아니라 EAS development/preview/production 빌드에서 테스트해야 합니다.

## 환경변수

서버는 아래 환경변수를 선택적으로 사용합니다.

- `PORT`: 기본값 `8787`
- `WATCHLIST`: 최초 실행 시 사용할 관심종목. `KR:005930:삼성전자,US:NVDA.O:NVIDIA` 형식
- `NAVER_KR_MOVERS_URL`: 기본 국내 급등 후보 URL을 바꾸고 싶을 때 지정
- `NAVER_US_MOVERS_URL`: 기본 미국 급등 후보 URL을 바꾸고 싶을 때 지정
- `PUSH_INTERVAL_SECONDS`: 서버 급등 푸시 감시 주기. 기본 120초, 최소 60초

민감정보와 인증정보는 GitHub에 커밋하지 않습니다.
