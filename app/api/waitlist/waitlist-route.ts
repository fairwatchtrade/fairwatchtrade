import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, isBuyer, isSeller } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!isBuyer && !isSeller) {
      return NextResponse.json({ error: 'Please select buyer, seller, or both' }, { status: 400 });
    }

    const role = isBuyer && isSeller ? 'Buyer & Seller' : isBuyer ? 'Buyer' : 'Seller';

    // Send confirmation email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'FairWatchTrade <onboarding@resend.dev>',
        to: email,
        subject: "You're on the FairWatchTrade waitlist",
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; background: #0D0F14; color: #E8E4DC; padding: 2rem;">
            <h1 style="font-family: Georgia, serif; font-weight: 300; color: #C9A84C; font-size: 1.8rem; margin-bottom: 0.5rem;">
              FairWatchTrade
            </h1>
            <p style="color: #8A8F9E; font-size: 0.8rem; letter-spacing: 0.1em; margin-bottom: 2rem;">
              GENÈVE — COMING SOON
            </p>
            <p style="line-height: 1.7; margin-bottom: 1rem;">
              You're on the list as a <strong style="color: #C9A84C;">${role}</strong>.
            </p>
            <p style="line-height: 1.7; color: #8A8F9E; margin-bottom: 2rem;">
              We'll be in touch before we launch — ${isSeller ? "with an invitation to list your watch before we go live." : "with early access to our curated listings."}
            </p>
            <p style="font-size: 0.75rem; color: #8A8F9E; border-top: 1px solid rgba(201,168,76,0.2); padding-top: 1rem;">
              FairWatchTrade — Independent & boutique timepieces. Flat 5% fee.
            </p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Resend error:', error);
      throw new Error('Email send failed');
    }

    // Also notify yourself
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'FairWatchTrade <onboarding@resend.dev>',
        to: 'jmynatt74@gmail.com',
        subject: `New waitlist signup — ${role}`,
        html: `<p><strong>${email}</strong> joined as <strong>${role}</strong></p>`,
      }),
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Waitlist error:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
