import { Context } from 'https://edge.netlify.com';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default async (request: Request, _context: Context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY') || '';

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Supabase service configuration missing' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await request.json();
    const { userId, selectedPlan, paymentMethod, amount, currency, transactionId, screenshotUrl, notes, userCoords } = body;

    if (!userId || !selectedPlan || !transactionId) {
      return new Response(JSON.stringify({ error: 'Missing required payment request fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { data, error } = await supabase.from('payment_requests').insert({
      user_id: userId,
      selected_plan: selectedPlan,
      payment_method: paymentMethod || 'Manual',
      amount: amount || 0,
      currency: currency || 'PKR',
      transaction_id: transactionId,
      screenshot_url: screenshotUrl || null,
      notes: notes || '',
      status: 'pending',
      user_coords: userCoords || null,
      submitted_at: new Date().toISOString()
    }).select().single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Payment submission failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};
