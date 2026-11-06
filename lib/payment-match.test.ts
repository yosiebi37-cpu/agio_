import { describe, it, expect } from 'vitest';
import { matchPaymentToBooking, type BookingForMatch } from './payment-match';

const b = (id: string, start: string, end: string, amount: number, extra: Partial<BookingForMatch> = {}): BookingForMatch => ({
  id,
  start_time: `${start}:00`,
  end_time: `${end}:00`,
  amount,
  status: 'confirmed',
  ...extra,
});

describe('matchPaymentToBooking', () => {
  it('matches the only booking in the time window', () => {
    const r = matchPaymentToBooking({ amount: 9500, time: '12:05' }, [b('a', '10:00', '12:00', 9500), b('c', '15:00', '16:00', 5500)]);
    expect(r).toEqual({ status: 'matched', bookingId: 'a', candidates: ['a'] });
  });

  it('allows retail added on top of the booking amount', () => {
    const r = matchPaymentToBooking({ amount: 13000, time: '12:10' }, [b('a', '10:00', '12:00', 9500)]);
    expect(r.status).toBe('matched');
  });

  it('allows a discount down to 70% of the booking amount', () => {
    expect(matchPaymentToBooking({ amount: 7000, time: '12:10' }, [b('a', '10:00', '12:00', 9500)]).status).toBe('matched');
    expect(matchPaymentToBooking({ amount: 6000, time: '12:10' }, [b('a', '10:00', '12:00', 9500)]).status).toBe('no_candidate');
  });

  it('does not match payments long after the booking ended', () => {
    expect(matchPaymentToBooking({ amount: 9500, time: '13:31' }, [b('a', '10:00', '12:00', 9500)]).status).toBe('no_candidate');
  });

  it('does not match payments before the booking started', () => {
    expect(matchPaymentToBooking({ amount: 9500, time: '09:50' }, [b('a', '10:00', '12:00', 9500)]).status).toBe('no_candidate');
  });

  it('skips bookings already matched to another payment', () => {
    const bookings = [b('x', '10:00', '12:00', 9500)];
    expect(matchPaymentToBooking({ amount: 9500, time: '12:00' }, bookings, new Set(['x'])).status).toBe('no_candidate');
  });

  it('prefers a booking that is not yet visited', () => {
    const bookings = [b('v', '10:00', '12:00', 9500, { status: 'visited' }), b('n', '10:30', '12:00', 9500)];
    expect(matchPaymentToBooking({ amount: 9500, time: '12:00' }, bookings)).toEqual({ status: 'matched', bookingId: 'n', candidates: ['n'] });
  });

  it('links to a booking already marked visited by hand when nothing else fits', () => {
    const bookings = [b('v', '10:00', '12:00', 9500, { status: 'visited' })];
    expect(matchPaymentToBooking({ amount: 9500, time: '12:00' }, bookings)).toEqual({ status: 'matched', bookingId: 'v', candidates: ['v'] });
  });

  it('picks the exact amount (booking + retail) when two bookings overlap', () => {
    const bookings = [b('a', '10:00', '12:00', 9500), b('s', '10:00', '12:00', 10500, { retailTotal: 2000 })];
    expect(matchPaymentToBooking({ amount: 12500, time: '12:05' }, bookings)).toEqual({
      status: 'matched',
      bookingId: 's',
      candidates: ['a', 's'],
    });
  });

  it('asks for review when two bookings overlap and the amount does not decide', () => {
    const bookings = [b('a', '10:00', '12:00', 9500), b('s', '10:00', '12:00', 9500)];
    expect(matchPaymentToBooking({ amount: 9500, time: '12:05' }, bookings)).toEqual({
      status: 'needs_review',
      candidates: ['a', 's'],
    });
  });
});
