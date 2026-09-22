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
- `NAVER_KR_MOVERS_URL`: 기본 국내 급등 후보 URL을 바꾸고 싶을 때 지정
- `NAVER_US_MOVERS_URL`: 기본 미국 급등 후보 URL을 바꾸고 싶을 때 지정

민감정보와 인증정보는 GitHub에 커밋하지 않습니다.
