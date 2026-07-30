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
    const { username, password } = await request.json();

    const expectedAdmin = Deno.env.get('ADMIN_EMAIL') || 'khizarraoworks@gmail.com';
    const expectedHash = Deno.env.get('ADMIN_PASSWORD_HASH') || '5c477a329d5b0d06cc94fa3682974b71db3fb94ea7adba5979eb11796c9c614b';
    const adminSecretKey = Deno.env.get('ADMIN_SECRET_KEY') || 'KR2006ADMIN';

    const enteredHash = await hashPassword((password || '').trim());

    if ((username || '').trim() === expectedAdmin && enteredHash === expectedHash) {
      // Return authorization token
      return new Response(
        JSON.stringify({
          success: true,
          token: adminSecretKey,
          username: expectedAdmin,
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
