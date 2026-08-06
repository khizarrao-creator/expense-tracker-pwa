declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
  };
}

declare module 'https://edge.netlify.com' {
  export interface Context {
    [key: string]: any;
  }
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string, options?: any): any;
}
