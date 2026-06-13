const sha256 = async (message: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

export const uploadToCloudinary = async (file: File, folder: string = 'vehicle_docs'): Promise<string> => {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '';
  const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY || '';
  const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET || '';

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary environment variables are not fully configured in your .env file.');
  }

  // Cloudinary expects timestamp in seconds
  const timestamp = Math.round(new Date().getTime() / 1000).toString();

  // Signature string must sort parameters alphabetically: folder, then timestamp
  const signatureString = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;

  // Generate SHA-256 signature
  const signature = await sha256(signatureString);

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', apiKey);
  formData.append('timestamp', timestamp);
  formData.append('signature', signature);
  formData.append('folder', folder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Failed to upload to Cloudinary');
  }

  const data = await response.json();
  return data.secure_url;
};
