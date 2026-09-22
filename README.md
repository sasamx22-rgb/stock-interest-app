# Market Pulse

개인용 Android 주식 관심도 앱입니다. 한국·미국 관심 종목, 급등/거래량 급증 신호, 오전 보고서와 프리마켓 보고서를 한곳에서 확인합니다.

## 현재 구현 범위

- 한국·미국 관심 종목 대시보드
- 상승률 5% + 거래량 3배 알림 조건 표시
- 한국/미국 급등 종목 화면
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

## Android APK

Expo 계정으로 로그인한 뒤 다음 명령을 실행합니다.

```bash
cd mobile
npx eas-cli@latest build --platform android --profile preview
```

`preview` 프로필은 직접 설치 가능한 APK를 생성합니다.

## 환경변수

서버는 아래 환경변수를 선택적으로 사용합니다.

- `PORT`: 기본값 `8787`
- `WATCHLIST`: `KR:005930:삼성전자,US:NVDA.O:NVIDIA` 형식
- `NAVER_KR_MOVERS_URL`: 네이버 국내 급등 목록 JSON 엔드포인트
- `NAVER_US_MOVERS_URL`: 네이버 미국 급등 목록 JSON 엔드포인트

민감정보와 인증정보는 GitHub에 커밋하지 않습니다.

