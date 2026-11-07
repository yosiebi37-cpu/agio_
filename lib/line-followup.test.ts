import { describe, it, expect } from 'vitest';
import { visitDateFor, shouldSendFollowup, buildFollowupMessage } from './line-followup';

describe('visitDateFor', () => {
  it('counts back from today', () => {
    expect(visitDateFor('thanks', '2026-11-07')).toBe('2026-11-06');
    expect(visitDateFor('followup45', '2026-11-07')).toBe('2026-09-23');
    expect(visitDateFor('followup90', '2026-11-07')).toBe('2026-08-09');
  });
});

describe('shouldSendFollowup', () => {
  it('sends when nothing is booked after the visit', () => {
    expect(shouldSendFollowup('2026-09-23', [{ booking_date: '2026-08-01', status: 'visited' }])).toBe(true);
  });
  it('does not send when a later booking exists', () => {
    expect(shouldSendFollowup('2026-09-23', [{ booking_date: '2026-11-20', status: 'confirmed' }])).toBe(false);
    expect(shouldSendFollowup('2026-09-23', [{ booking_date: '2026-10-15', status: 'visited' }])).toBe(false);
  });
});

describe('buildFollowupMessage', () => {
  it('adds 様 once and includes the booking link for follow-ups', () => {
    const text = buildFollowupMessage('followup45', '山田 花子 様', 'https://liff.line.me/x');
    expect(text).toContain('山田 花子様、その後、ヘアスタイルはいかがでしょうか？');
    expect(text).toContain('https://liff.line.me/x');
  });
  it('does not include a booking link in the thank-you message', () => {
    expect(buildFollowupMessage('thanks', '山田 花子', 'https://liff.line.me/x')).not.toContain('liff');
  });
});

describe('buildFollowupMessage 90日後', () => {
  it('does not assume the season', () => {
    const text = buildFollowupMessage('followup90', '山田 花子', null);
    expect(text).not.toContain('季節');
    expect(text).toContain('3ヶ月ほど');
  });
});
