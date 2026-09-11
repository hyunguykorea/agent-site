#!/usr/bin/env bash
# ------------------------------------------------------------
# 목적: 파일이 한 폴더에 납작하게(flat) 다운로드된 경우에도
#       올바른 폴더 구조로 자동 정리해 주는 스크립트.
# 사용: bash setup-project.sh   (프로젝트 폴더 안에서 실행)
# ------------------------------------------------------------
set -e

mkdir -p pages/api components lib styles

move() { [ -f "$1" ] && mv -f "$1" "$2" && echo "  moved $1 -> $2"; true; }

echo "1) 폴더 정리"
move _app.tsx               pages/_app.tsx
move index.tsx              pages/index.tsx
move chat.tsx               pages/chat.tsx
move history.tsx            pages/history.tsx
move survey.tsx             pages/survey.tsx
move directline-token.ts    pages/api/directline-token.ts
move NavBar.tsx             components/NavBar.tsx
move ChatWindow.tsx         components/ChatWindow.tsx
move dlClient.ts            lib/dlClient.ts
move speechHooks.ts         lib/speechHooks.ts
move ttsClean.ts            lib/ttsClean.ts
move historyStore.ts        lib/historyStore.ts
move appTypes.ts            lib/appTypes.ts
move globals.css            styles/globals.css

echo "2) 설정 파일 생성"
[ -f .gitignore ]  || { cp gitignore-template.txt .gitignore; echo "  .gitignore 생성"; }
[ -f .env.local ]  || { cp env-example.txt .env.local;      echo "  .env.local 생성 (시크릿 값을 채우세요)"; }

echo "3) 구조 확인"
find pages components lib styles -type f | sort

echo ""
echo "완료! 다음을 실행하세요:  npm install && npm run dev"
