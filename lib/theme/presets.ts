import type { CSSProperties } from "react";

/**
 * 카테고리 테마 프리셋 (#6) — 페이지별로 THEME 객체를 개별 선언하던 것을 중앙화.
 * 래퍼 `<div style={THEME_X}>` 안에서 디자인 시스템의 primary 계열 클래스가 재테마된다.
 * (Tailwind @theme inline: --color-primary → var(--primary) 를 사용 시점에 해석)
 */

/** 기본(청약·분양) = 파랑 — 전역 --primary와 동일하지만 명시적 래핑이 필요할 때 사용 */
export const THEME_APPLY = {
  "--primary": "#1d4fd8",
  "--primary-soft": "#edf2fe",
  "--primary-strong": "#16389c",
} as CSSProperties;

/** 입주 물량 = 초록 (공급·신축) */
export const THEME_SUPPLY = {
  "--primary": "#0e9f6e",
  "--primary-soft": "#e7f6ef",
  "--primary-strong": "#0b8058",
} as CSSProperties;

/** 공매·경매 = 보라 (딜·긴급) */
export const THEME_AUCTION = {
  "--primary": "#7c3aed",
  "--primary-soft": "#f1ebfe",
  "--primary-strong": "#6528d6",
} as CSSProperties;

/** 개발물건 중개 = 앰버 (B2B·개발) */
export const THEME_DEV = {
  "--primary": "#d97706",
  "--primary-soft": "#fdf1df",
  "--primary-strong": "#b45309",
} as CSSProperties;
