'use client';

import { useRef, useState, type CompositionEvent, type ChangeEvent } from 'react';
import { hiraganaToKatakana } from './format';

/**
 * お客様名（漢字）を入力している間、IME変換前の読み（ひらがな）からフリガナ欄を自動で埋める。
 * ユーザーがフリガナ欄を一度でも手入力したら、以後は自動更新を止めて上書きしない。
 */
export function useFuriganaAutofill(initial = '') {
  const [furigana, setFuriganaState] = useState(initial);
  const touchedRef = useRef(!!initial);
  const segmentsRef = useRef<string[]>([]);
  const currentRef = useRef('');

  const applyLive = () => {
    if (touchedRef.current) return;
    const combined = [...segmentsRef.current, currentRef.current].filter(Boolean).join(' ');
    setFuriganaState(combined);
  };

  const onFuriganaChange = (e: ChangeEvent<HTMLInputElement>) => {
    touchedRef.current = true;
    setFuriganaState(e.target.value);
  };

  const onNameCompositionUpdate = (e: CompositionEvent<HTMLInputElement>) => {
    currentRef.current = hiraganaToKatakana(e.data);
    applyLive();
  };

  const onNameCompositionEnd = () => {
    if (currentRef.current) segmentsRef.current.push(currentRef.current);
    currentRef.current = '';
  };

  const reset = (value = '') => {
    setFuriganaState(value);
    touchedRef.current = !!value;
    segmentsRef.current = [];
    currentRef.current = '';
  };

  return {
    furigana,
    onFuriganaChange,
    nameCompositionHandlers: {
      onCompositionUpdate: onNameCompositionUpdate,
      onCompositionEnd: onNameCompositionEnd,
    },
    reset,
  };
}
