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
  message?: WhatsAppMessage;
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
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
    const errorMsg = error instanceof Error ? error.message : 'Network error';
    return { success: false, error: errorMsg };
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

export interface WhatsAppContact {
  jid: string;
  name: string;
  phone: string;
}

export interface WhatsAppMessage {
  id: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  senderName: string;
}

export interface WhatsAppStatus {
  filename: string;
  contactName: string;
  contactNumber: string;
  timestamp: number;
  mediaType: 'image' | 'video';
  cloudinaryUrl: string | null;
}

export const getWhatsAppContacts = async (accountId: string): Promise<WhatsAppContact[]> => {
  try {
    const response = await fetch(`/whatsapp-api/contacts?accountId=${accountId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.contacts || [];
  } catch (error) {
    console.error('Failed to get WhatsApp contacts:', error);
    return [];
  }
};

export const getWhatsAppMessages = async (accountId: string, jid: string): Promise<WhatsAppMessage[]> => {
  try {
    const response = await fetch(`/whatsapp-api/messages?accountId=${accountId}&jid=${encodeURIComponent(jid)}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Failed to get WhatsApp messages:', error);
    return [];
  }
};

export const getWhatsAppStatuses = async (accountId: string): Promise<WhatsAppStatus[]> => {
  try {
    const response = await fetch(`/whatsapp-api/statuses?accountId=${accountId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.statuses || [];
  } catch (error) {
    console.error('Failed to get WhatsApp statuses:', error);
    return [];
  }
};

export const syncWhatsAppStatus = async (accountId: string, filename: string): Promise<WhatsAppStatus | null> => {
  try {
    const response = await fetch('/whatsapp-api/sync-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accountId, filename })
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.success ? data.status : null;
  } catch (error) {
    console.error('Failed to sync WhatsApp status:', error);
    return null;
  }
};

export const syncAllWhatsAppStatuses = async (accountId: string): Promise<WhatsAppStatus[]> => {
  try {
    const response = await fetch('/whatsapp-api/sync-all-statuses', {
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
    return data.success ? data.syncedItems || [] : [];
  } catch (error) {
    console.error('Failed to sync all WhatsApp statuses:', error);
    return [];
  }
};

export const deleteWhatsAppMessage = async (
  accountId: string,
  jid: string,
  messageId: string,
  fromMe: boolean,
  everyone: boolean
): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await fetch('/whatsapp-api/delete-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ accountId, jid, messageId, fromMe, everyone })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete message');
    }
    return data;
  } catch (error) {
    console.error('Failed to delete WhatsApp message:', error);
    const errorMsg = error instanceof Error ? error.message : 'Network error';
    return { success: false, error: errorMsg };
  }
};
