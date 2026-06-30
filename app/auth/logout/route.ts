import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/ssr-server';

export async function POST() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'));
}
