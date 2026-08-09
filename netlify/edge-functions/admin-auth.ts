/// <reference path="../../src/deno-edge.d.ts" />
import { Context } from 'https://edge.netlify.com';

const hashPassword = async (password: string) => {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

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
    const { username = '', password = '' } = (await request.json().catch(() => ({}))) as { username?: string; password?: string };

    const expectedAdmin = (Deno.env.get('ADMIN_EMAIL') || Deno.env.get('SMTP_USER') || Deno.env.get('VITE_ADMIN_EMAIL') || 'admin').toLowerCase();
    const expectedHash = Deno.env.get('ADMIN_PASSWORD_HASH') || '87c40054c67228b844f131b7b9d173f979646b76232285af84d20be049c1d007';
    const adminSecretKey = Deno.env.get('ADMIN_SECRET_KEY') || 'admin_secret';

    const enteredUser = (username || '').trim().toLowerCase();
    const enteredHash = await hashPassword((password || '').trim());

    const validHashes = [
      expectedHash,
      '87c40054c67228b844f131b7b9d173f979646b76232285af84d20be049c1d007', // 159068
      'b897c7d14a0206dcb9b877a04fdce7910e6f86c3a1f185fb650632404bfb5fc9'  // KR2006ADMIN
    ];

    // Allow user if email is provided and hash matches
    const isUserMatch = enteredUser === expectedAdmin || enteredUser === 'admin' || enteredUser.includes('@');
    const isPassMatch = validHashes.includes(enteredHash);

    if (isUserMatch && isPassMatch) {
      return new Response(
        JSON.stringify({
          success: true,
          token: adminSecretKey,
          username: enteredUser,
          expiresIn: 86400 * 7,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid credentials' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Server error' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
};
