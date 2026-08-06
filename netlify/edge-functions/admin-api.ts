import { Context } from 'https://edge.netlify.com';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export default async (request: Request, _context: Context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const expectedSecret = Deno.env.get('ADMIN_SECRET_KEY');

  if (!token || token !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized admin token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const supabaseUrl = Deno.env.get('VITE_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('VITE_SUPABASE_ANON_KEY') || '';

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Supabase service environment variables missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await request.json();
    const { action, payload } = body;

    switch (action) {
      case 'update_user_status': {
        const { userId, updates } = payload;
        const { data, error } = await supabase.from('users').update(updates).eq('id', userId).select();
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'update_config': {
        const { key, value } = payload;
        const { data, error } = await supabase.from('app_config').upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'update_plans': {
        const { plans } = payload;
        const { data, error } = await supabase.from('plans').upsert(plans);
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'process_payment': {
        const { requestId, status, rejectionReason, userPlan, planExpiresAt } = payload;
        const { data: payReq, error: reqErr } = await supabase.from('payment_requests').update({
          status,
          rejection_reason: rejectionReason || null,
          verified_at: new Date().toISOString()
        }).eq('id', requestId).select().single();
        
        if (reqErr) throw reqErr;

        if (status === 'approved' && payReq) {
          await supabase.from('users').update({
            is_pro: userPlan !== 'standard',
            plan: userPlan,
            plan_expires_at: planExpiresAt,
            plan_assigned_by: 'admin_panel'
          }).eq('id', payReq.user_id);
        }

        return new Response(JSON.stringify({ success: true, data: payReq }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      case 'send_notification': {
        const { userId, message } = payload;
        if (userId === 'broadcast') {
          const { data, error } = await supabase.from('broadcast_notifications').insert({ message });
          if (error) throw error;
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        } else {
          const { data, error } = await supabase.from('notifications').insert({ user_id: userId, message });
          if (error) throw error;
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown admin action: ${action}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
};
