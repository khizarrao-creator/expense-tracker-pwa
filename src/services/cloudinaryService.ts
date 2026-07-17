import { getApiUrl } from './whatsappService';
import { auth } from '../firebase';

export const uploadToCloudinary = async (file: File, folder: string = 'vehicle_docs'): Promise<string> => {
  try {
    // 1. Fetch Firebase ID Token for authorization
    const idToken = auth?.currentUser ? await auth.currentUser.getIdToken() : '';
    const signUrl = getApiUrl('/api/cloudinary/sign');

    // 2. Fetch the signature from the server proxy
    const signResponse = await fetch(signUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ folder })
    });

    if (!signResponse.ok) {
      const errData = await signResponse.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to sign Cloudinary request.');
    }

    const { signature, timestamp, apiKey, cloudName } = await signResponse.json();

    // 3. Perform upload directly from client to Cloudinary using signed signature
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('folder', folder);

    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: formData
    });

    if (!uploadResponse.ok) {
      const errData = await uploadResponse.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'Failed to upload file to cloud storage.');
    }

    const uploadData = await uploadResponse.json();
    return uploadData.secure_url;
  } catch (error: any) {
    console.error('[Cloudinary Service] Upload failed:', error);
    throw new Error(error.message || 'Cloudinary upload failed');
  }
};
