import { NextRequest, NextResponse } from 'next/server';
import { FAIRWATCHTRADE_SYSTEM_PROMPT, buildEvaluationPrompt, ListingSubmission, EvaluationResult } from '@/lib/evaluationPrompt';

export async function POST(request: NextRequest) {
  try {
    const listing: ListingSubmission = await request.json();

    if (!listing.brand) {
      return NextResponse.json(
        { error: 'Brand is required' },
        { status: 400 }
      );
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        /* 1024 truncated real evaluations mid-JSON once the Rolex
           selective-admission guidance grew (v3.39): the response ended
           inside a string, JSON.parse threw "Unterminated string", and the
           seller saw an intermittent 500 unrelated to their inputs. 2048
           gives the richest observed response roughly 2x headroom. */
        max_tokens: 2048,
        system: FAIRWATCHTRADE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: buildEvaluationPrompt(listing),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    // Fail loudly and diagnosably if the cap is ever hit again — a truncated
    // response must never reach JSON.parse as a mystery syntax error.
    if (data.stop_reason === 'max_tokens') {
      throw new Error('Evaluation response truncated at max_tokens');
    }
    const rawText = data.content
      .map((block: { type: string; text?: string }) => block.type === 'text' ? block.text : '')
      .join('');

    // Strip any markdown fences if present
    const clean = rawText.replace(/```json|```/g, '').trim();
    const evaluation: EvaluationResult = JSON.parse(clean);

    return NextResponse.json(evaluation);

  } catch (error) {
    console.error('Evaluation error:', error);
    return NextResponse.json(
      { error: 'Evaluation failed. Please try again.' },
      { status: 500 }
    );
  }
}
