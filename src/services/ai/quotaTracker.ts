export interface QuotaStatus {
  rpm: number;
  tpm: number;
  rpd: number;
  dateStr: string;
}

interface RequestLogEntry {
  timestamp: number;
  tokens: number;
}

export const getQuotaUsage = (): QuotaStatus => {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // 1. Load sliding window request logs
  let logs: RequestLogEntry[] = [];
  try {
    const rawLogs = localStorage.getItem('ai_request_logs');
    if (rawLogs) {
      logs = JSON.parse(rawLogs);
    }
  } catch (e) {
    console.error('Failed to parse AI request logs:', e);
  }

  // Filter logs to last 60 seconds
  const cutoff = now - 60000;
  logs = logs.filter(entry => entry.timestamp > cutoff);

  // Update filtered logs back in localStorage
  try {
    localStorage.setItem('ai_request_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save filtered AI request logs:', e);
  }

  // Calculate RPM and TPM
  const rpm = logs.length;
  const tpm = logs.reduce((sum, entry) => sum + entry.tokens, 0);

  // 2. Load daily requests count
  let rpd = 0;
  try {
    const rawRpd = localStorage.getItem('ai_rpd_count');
    const rawRpdDate = localStorage.getItem('ai_rpd_date');
    if (rawRpdDate === today && rawRpd) {
      rpd = parseInt(rawRpd, 10) || 0;
    } else {
      localStorage.setItem('ai_rpd_date', today);
      localStorage.setItem('ai_rpd_count', '0');
    }
  } catch (e) {
    console.error('Failed to read daily AI request count:', e);
  }

  return { rpm, tpm, rpd, dateStr: today };
};

export const recordApiRequest = (estimatedTokens: number): QuotaStatus => {
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];

  // 1. Add to sliding window logs
  let logs: RequestLogEntry[] = [];
  try {
    const rawLogs = localStorage.getItem('ai_request_logs');
    if (rawLogs) {
      logs = JSON.parse(rawLogs);
    }
  } catch (e) {
    console.error('Failed to parse AI request logs for recording:', e);
  }

  logs.push({ timestamp: now, tokens: estimatedTokens });

  // Filter to last 60 seconds
  const cutoff = now - 60000;
  logs = logs.filter(entry => entry.timestamp > cutoff);

  try {
    localStorage.setItem('ai_request_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save AI request logs:', e);
  }

  // Calculate RPM and TPM
  const rpm = logs.length;
  const tpm = logs.reduce((sum, entry) => sum + entry.tokens, 0);

  // 2. Increment daily requests count
  let rpd = 0;
  try {
    const rawRpd = localStorage.getItem('ai_rpd_count');
    const rawRpdDate = localStorage.getItem('ai_rpd_date');
    if (rawRpdDate === today && rawRpd) {
      rpd = (parseInt(rawRpd, 10) || 0) + 1;
    } else {
      rpd = 1;
    }
    localStorage.setItem('ai_rpd_date', today);
    localStorage.setItem('ai_rpd_count', rpd.toString());
  } catch (e) {
    console.error('Failed to record daily AI request:', e);
  }

  // 3. Dispatch global event to update UI in real-time
  window.dispatchEvent(new Event('ai_quota_updated'));

  return { rpm, tpm, rpd, dateStr: today };
};
