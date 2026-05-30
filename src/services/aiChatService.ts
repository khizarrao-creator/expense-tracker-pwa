import { db as firestore } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import type { FinancialSnapshot } from './aiDataService';
import { formatSnapshotForAI } from './aiDataService';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface ChatSession {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const getSessionDocRef = (uid: string, sessionId: string) =>
  doc(firestore, 'users', uid, 'ai_sessions', sessionId);

/** Load or create a chat session from Firestore */
export const loadSession = async (uid: string, sessionId: string): Promise<ChatSession> => {
  try {
    const ref = getSessionDocRef(uid, sessionId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      return {
        sessionId,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        messages: data.messages || [],
      };
    }
  } catch (e) {
    console.warn('[aiChatService] Failed to load session from Firestore, falling back to empty:', e);
  }

  // Return empty session if Firestore fails or doc doesn't exist
  return {
    sessionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };
};

/** Append a message to the Firestore session */
export const saveMessage = async (uid: string, sessionId: string, message: ChatMessage): Promise<void> => {
  try {
    const ref = getSessionDocRef(uid, sessionId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      // Create the document first
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [message],
      });
    } else {
      await updateDoc(ref, {
        updatedAt: new Date().toISOString(),
        messages: arrayUnion(message),
      });
    }
  } catch (e) {
    console.warn('[aiChatService] Failed to save message to Firestore:', e);
    // Silently fail — chat still works locally
  }
};

/** Delete a session's messages from Firestore */
export const clearSession = async (uid: string, sessionId: string): Promise<void> => {
  try {
    const ref = getSessionDocRef(uid, sessionId);
    await setDoc(ref, {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    });
  } catch (e) {
    console.warn('[aiChatService] Failed to clear session in Firestore:', e);
  }
};

/** Send messages to the Gemini API and return the model's response text */
export const sendToGemini = async (
  messages: ChatMessage[],
  snapshot: FinancialSnapshot,
  currencyCode: string,
  currencySymbol: string,
  apiKey: string
): Promise<string> => {
  const snapshotText = formatSnapshotForAI(snapshot, currencySymbol);

  const systemInstruction = `You are Ledger AI — a personal financial copilot embedded in the user's expense tracker app.
You have access to the user's real financial data (shown below) and your job is to help them understand their finances, identify patterns, and make better decisions.

Guidelines:
- Always base answers on the actual data provided. Never make up figures or invent transactions.
- If the data is empty (e.g. no transactions this month), say so clearly and constructively.
- Format responses using Markdown — use **bold**, bullet lists, and headers (##) where helpful.
- Use the user's currency (${currencyCode} / ${currencySymbol}) for all monetary values.
- Be concise, friendly, and actionable. Avoid technical jargon.
- If the user asks about something you don't have data for, say so honestly.

${snapshotText}`;

  // Map messages to Gemini API format (skip system-like context)
  const apiContents = messages.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));

  const response = await fetch(`${GEMINI_BASE_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: apiContents,
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response generated from the AI model.');
  return text;
};
