import { NextRequest, NextResponse } from 'next/server';
import { sendAlert, AlertPayload } from '@/lib/telegram-alert';

/**
 * POST /api/alert — Universal alert endpoint
 * Any internal component can POST here to trigger a Telegram alert.
 * Also used by the global error boundary.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { severity, title, details, action, component, context } = body;

    if (!title || !details) {
      return NextResponse.json({ error: 'title and details are required' }, { status: 400 });
    }

    const payload: AlertPayload = {
      dashboard: process.env.NEXT_PUBLIC_DASHBOARD_NAME || 'Unknown Dashboard',
      site: process.env.NEXT_PUBLIC_DASHBOARD_URL || '',
      severity: severity || 'error',
      title,
      details,
      action,
      component,
      context,
    };

    const sent = await sendAlert(payload);
    return NextResponse.json({ sent });
  } catch (err) {
    console.error('[alert-route]', err);
    return NextResponse.json({ error: 'Failed to send alert' }, { status: 500 });
  }
}
