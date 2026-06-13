export interface WhatsAppAccount {
  id: string;
  name: string;
  status: 'disconnected' | 'connecting' | 'qr' | 'connected';
  qrCodeUrl: string | null;
  hasCreds: boolean;
}

export interface WhatsAppStatusResponse {
  accounts: WhatsAppAccount[];
}

export interface SendMessageResponse {
  success: boolean;
  error?: string;
}

export const getWhatsAppStatus = async (): Promise<WhatsAppStatusResponse> => {
  try {
    const response = await fetch('/whatsapp-api/status');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to get WhatsApp status:', error);
    // Return empty status list as fallback
    return {
      accounts: [
        { id: 'account1', name: 'Primary Account', status: 'disconnected', qrCodeUrl: null, hasCreds: false },
        { id: 'account2', name: 'Secondary Account', status: 'disconnected', qrCodeUrl: null, hasCreds: false },
        { id: 'account3', name: 'Work Account', status: 'disconnected', qrCodeUrl: null, hasCreds: false }
      ]
    };
  }
};

export const sendWhatsAppMessage = async (
  accountId: string,
  phone: string,
  message: string
): Promise<SendMessageResponse> => {
  try {
    const response = await fetch('/whatsapp-api/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accountId, phone, message })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to send message');
    }
    return data;
  } catch (error: any) {
    console.error('Failed to send WhatsApp message:', error);
    return { success: false, error: error.message || 'Network error' };
  }
};

export const logoutWhatsApp = async (accountId: string): Promise<boolean> => {
  try {
    const response = await fetch('/whatsapp-api/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accountId })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to logout WhatsApp account:', error);
    return false;
  }
};

export const initWhatsApp = async (accountId: string): Promise<boolean> => {
  try {
    const response = await fetch('/whatsapp-api/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accountId })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Failed to initialize WhatsApp account:', error);
    return false;
  }
};
