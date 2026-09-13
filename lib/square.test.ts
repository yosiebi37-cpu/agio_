import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifySquareSignature, utcIsoToJst, jstToUtcIso, isBookingCancelled, extractBooking, type SquareWebhookEvent } from './square';

describe('verifySquareSignature', () => {
  const key = 'test-signing-key';
  const url = 'https://agio-1vgc.vercel.app/api/square-webhook';
  const body = '{"type":"booking.created"}';

  it('accepts a correctly signed request', () => {
    const signature = crypto.createHmac('sha256', key).update(url + body).digest('base64');
    expect(verifySquareSignature(body, signature, url, key)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signature = crypto.createHmac('sha256', key).update(url + body).digest('base64');
    expect(verifySquareSignature(body + 'x', signature, url, key)).toBe(false);
  });

  it('rejects a missing signature', () => {
    expect(verifySquareSignature(body, null, url, key)).toBe(false);
  });

  it('rejects the wrong key', () => {
    const signature = crypto.createHmac('sha256', 'other-key').update(url + body).digest('base64');
    expect(verifySquareSignature(body, signature, url, key)).toBe(false);
  });
});

describe('utcIsoToJst', () => {
  it('converts a UTC instant to JST date and time', () => {
    expect(utcIsoToJst('2026-09-10T00:00:00Z')).toEqual({ date: '2026-09-10', time: '09:00' });
  });

  it('rolls over into the next JST day', () => {
    expect(utcIsoToJst('2026-09-10T20:30:00Z')).toEqual({ date: '2026-09-11', time: '05:30' });
  });
});

describe('jstToUtcIso', () => {
  it('converts JST date/time to a UTC ISO string', () => {
    expect(jstToUtcIso('2026-09-10', '09:00')).toBe('2026-09-10T00:00:00.000Z');
  });

  it('rolls back into the previous UTC day', () => {
    expect(jstToUtcIso('2026-09-11', '05:30')).toBe('2026-09-10T20:30:00.000Z');
  });
});

describe('isBookingCancelled', () => {
  it('treats CANCELLED_BY_* and DECLINED as cancelled', () => {
    expect(isBookingCancelled('CANCELLED_BY_CUSTOMER')).toBe(true);
    expect(isBookingCancelled('CANCELLED_BY_SELLER')).toBe(true);
    expect(isBookingCancelled('DECLINED')).toBe(true);
  });
  it('treats other statuses as active', () => {
    expect(isBookingCancelled('ACCEPTED')).toBe(false);
    expect(isBookingCancelled('PENDING')).toBe(false);
  });
});

describe('extractBooking', () => {
  it('pulls the booking object out of the webhook envelope', () => {
    const payload: SquareWebhookEvent = {
      type: 'booking.created',
      data: { object: { booking: { id: 'bk1', status: 'ACCEPTED', start_at: '2026-09-10T00:00:00Z' } } },
    };
    expect(extractBooking(payload)?.id).toBe('bk1');
  });
  it('returns null when the booking is missing', () => {
    expect(extractBooking({ type: 'booking.created' })).toBeNull();
  });
});
