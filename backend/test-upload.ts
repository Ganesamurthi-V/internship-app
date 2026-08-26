import { supabaseAdmin } from './src/lib/supabase';
import { env } from './src/lib/env';

async function test() {
  const { data, error } = await supabaseAdmin().storage.from(env.STORAGE_BUCKET).createSignedUploadUrl('test.pdf');
  console.log('Upload URL:', data?.signedUrl);
  console.log('Token:', data?.token);

  if (data?.signedUrl) {
    const res = await fetch(data.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
      },
      body: 'test content'
    });
    console.log('PUT without auth:', res.status, await res.text());

    const res2 = await fetch(data.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        'Authorization': `Bearer ${data.token}`
      },
      body: 'test content'
    });
    console.log('PUT with auth:', res2.status, await res2.text());
  }
}
test();
