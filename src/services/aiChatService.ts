import { db as firestore } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  collection,
  getDocs,
  query,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';
import type { FinancialSnapshot } from './aiDataService';
import { formatSnapshotForAI } from './aiDataService';
import { getApiKey, markModelUnavailable } from './ai';
import { selectModelChain } from './ai/router';
import { resolveModel } from './ai/modelRegistry';

const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models`;

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  imageUrl?: string; // Cloudinary secure URL saved in Firestore
  image?: {
    mimeType: string;
    data: string; // base64 string
  };
  functionCall?: {
    name: string;
    args: any;
  };
  functionResponse?: {
    name: string;
    response: any;
  };
}

export interface GeminiResponse {
  text?: string;
  functionCall?: {
    name: string;
    args: any;
  };
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

    // Strip large base64 data to avoid 1MB document size limit, use Cloudinary URL instead
    const sanitizedMessage = { ...message };
    if (sanitizedMessage.image) {
      delete sanitizedMessage.image;
    }

    if (!snap.exists()) {
      // Create the document first
      await setDoc(ref, {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [sanitizedMessage],
      });
    } else {
      await updateDoc(ref, {
        updatedAt: new Date().toISOString(),
        messages: arrayUnion(sanitizedMessage),
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
// Tool declarations for Gemini API function calling
const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'add_transaction',
        description: 'Create a new financial transaction (expense, income, or transfer) inside the user\'s ledger database.',
        parameters: {
          type: 'OBJECT',
          properties: {
            type: {
              type: 'STRING',
              enum: ['expense', 'income', 'transfer'],
              description: 'The type of transaction.'
            },
            amount: {
              type: 'NUMBER',
              description: 'The transaction amount (positive number).'
            },
            category: {
              type: 'STRING',
              description: 'The category name (e.g. Food, Transport, Bills, Shopping, Entertainment, Health, Loan, Salary, Investment, Other).'
            },
            description: {
              type: 'STRING',
              description: 'Optional description or details about the transaction.'
            },
            date: {
              type: 'STRING',
              description: 'The date of the transaction in YYYY-MM-DD format. Defaults to today\'s date if not specified.'
            },
            payment_method: {
              type: 'STRING',
              description: 'Optional payment method (e.g., Cash, Debit Card, Credit Card, Bank Transfer).'
            },
            account_name: {
              type: 'STRING',
              description: 'The name of the account to associate the transaction with (e.g. Cash, Bank Account, Savings, Credit Card). Must match one of the user\'s existing accounts.'
            },
            to_account_name: {
              type: 'STRING',
              description: 'For transfers, the destination account name (must match one of the user\'s existing accounts).'
            },
            subcategory: {
              type: 'STRING',
              description: 'Optional subcategory name.'
            }
          },
          required: ['type', 'amount', 'category', 'account_name']
        }
      },
      {
        name: 'update_transaction',
        description: 'Update/edit an existing transaction by its database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique transaction ID (e.g. a UUID or string).'
            },
            updates: {
              type: 'OBJECT',
              properties: {
                type: {
                  type: 'STRING',
                  enum: ['expense', 'income', 'transfer']
                },
                amount: {
                  type: 'NUMBER'
                },
                category: {
                  type: 'STRING'
                },
                description: {
                  type: 'STRING'
                },
                date: {
                  type: 'STRING',
                  description: 'Date in YYYY-MM-DD format.'
                },
                payment_method: {
                  type: 'STRING'
                },
                account_name: {
                  type: 'STRING',
                  description: 'Name of the source account.'
                },
                to_account_name: {
                  type: 'STRING',
                  description: 'For transfers, name of the destination account.'
                },
                subcategory: {
                  type: 'STRING'
                }
              },
              description: 'The fields to update (only specify fields that should be changed).'
            }
          },
          required: ['id', 'updates']
        }
      },
      {
        name: 'delete_transaction',
        description: 'Delete/remove a transaction by its database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique transaction ID to delete.'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_transactions',
        description: 'Read and filter transactions from the database (useful when looking for transactions not in the recent snapshot).',
        parameters: {
          type: 'OBJECT',
          properties: {
            limit: {
              type: 'NUMBER',
              description: 'Max number of results to return (default 50, max 100).'
            },
            offset: {
              type: 'NUMBER',
              description: 'Number of items to skip for pagination.'
            }
          }
        }
      },
      {
        name: 'add_loan',
        description: 'Create a new loan entry (borrowing or lending) in the user\'s loan management system.',
        parameters: {
          type: 'OBJECT',
          properties: {
            direction: {
              type: 'STRING',
              enum: ['given', 'taken'],
              description: '\'given\' if lending money to someone (receivable), \'taken\' if borrowing money from someone (payable).'
            },
            party_name: {
              type: 'STRING',
              description: 'The name of the counterparty (person/organization). If the party doesn\'t exist, it will be automatically created.'
            },
            amount: {
              type: 'NUMBER',
              description: 'The loan principal amount (positive number).'
            },
            date: {
              type: 'STRING',
              description: 'The date of the loan in YYYY-MM-DD format. Defaults to today\'s date if not specified.'
            },
            description: {
              type: 'STRING',
              description: 'Optional details about the loan.'
            },
            due_date: {
              type: 'STRING',
              description: 'Optional due date for the loan in YYYY-MM-DD format.'
            },
            category: {
              type: 'STRING',
              description: 'Optional category of the loan (e.g. Personal, Business, Education). Defaults to \'Personal\'.'
            },
            account_name: {
              type: 'STRING',
              description: 'Optional name of the account from which money was lent or to which borrowed money was deposited (e.g. Cash, Bank Account). Must match one of the user\'s existing accounts.'
            }
          },
          required: ['direction', 'party_name', 'amount', 'date']
        }
      },
      {
        name: 'update_loan',
        description: 'Update/edit an existing loan by its database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique loan ID.'
            },
            updates: {
              type: 'OBJECT',
              properties: {
                direction: {
                  type: 'STRING',
                  enum: ['given', 'taken']
                },
                party_name: {
                  type: 'STRING'
                },
                amount: {
                  type: 'NUMBER'
                },
                date: {
                  type: 'STRING',
                  description: 'YYYY-MM-DD format.'
                },
                description: {
                  type: 'STRING'
                },
                due_date: {
                  type: 'STRING',
                  description: 'YYYY-MM-DD format or null/empty.'
                },
                category: {
                  type: 'STRING'
                },
                account_name: {
                  type: 'STRING'
                },
                status: {
                  type: 'STRING',
                  enum: ['open', 'closed', 'partial', 'loss']
                }
              },
              description: 'The fields to update.'
            }
          },
          required: ['id', 'updates']
        }
      },
      {
        name: 'delete_loan',
        description: 'Delete/remove a loan and its repayments history by its database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique loan ID to delete.'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_loans',
        description: 'Read and filter loans from the database (useful when looking for loans not in the recent snapshot).',
        parameters: {
          type: 'OBJECT',
          properties: {
            direction: {
              type: 'STRING',
              enum: ['given', 'taken']
            },
            status: {
              type: 'STRING',
              enum: ['open', 'closed', 'partial', 'loss', 'all']
            }
          }
        }
      },
      {
        name: 'add_loan_party',
        description: 'Create a new counterparty in the loan management system.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description: 'The name of the counterparty.'
            },
            phone: {
              type: 'STRING',
              description: 'Optional phone number.'
            },
            email: {
              type: 'STRING',
              description: 'Optional email address.'
            },
            notes: {
              type: 'STRING',
              description: 'Optional notes.'
            }
          },
          required: ['name']
        }
      },
      {
        name: 'update_loan_party',
        description: 'Update/edit an existing loan counterparty by their database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique counterparty ID.'
            },
            updates: {
              type: 'OBJECT',
              properties: {
                name: {
                  type: 'STRING'
                },
                phone: {
                  type: 'STRING'
                },
                email: {
                  type: 'STRING'
                },
                notes: {
                  type: 'STRING'
                }
              },
              description: 'The fields to update.'
            }
          },
          required: ['id', 'updates']
        }
      },
      {
        name: 'delete_loan_party',
        description: 'Delete/remove a counterparty by its database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique counterparty ID to delete.'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_loan_parties',
        description: 'Read the full list of counterparties for loan management.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'add_category',
        description: 'Create a new transaction category or subcategory.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: {
              type: 'STRING',
              description: 'The name of the category.'
            },
            type: {
              type: 'STRING',
              enum: ['income', 'expense'],
              description: 'Whether it is an income or expense category.'
            },
            icon: {
              type: 'STRING',
              description: 'Optional icon name (Lucide icon name).'
            },
            parent_name: {
              type: 'STRING',
              description: 'Optional name of the parent category, if creating a subcategory.'
            }
          },
          required: ['name', 'type']
        }
      },
      {
        name: 'update_category',
        description: 'Update/edit an existing category by its database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique category ID.'
            },
            updates: {
              type: 'OBJECT',
              properties: {
                name: {
                  type: 'STRING'
                },
                type: {
                  type: 'STRING',
                  enum: ['income', 'expense']
                },
                icon: {
                  type: 'STRING'
                },
                parent_name: {
                  type: 'STRING',
                  description: 'Name of the new parent category if changing parent.'
                }
              },
              description: 'The fields to update.'
            }
          },
          required: ['id', 'updates']
        }
      },
      {
        name: 'delete_category',
        description: 'Delete/remove a category by its database ID.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: {
              type: 'STRING',
              description: 'The unique category ID to delete.'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'get_categories',
        description: 'Read and filter categories from the database.',
        parameters: {
          type: 'OBJECT',
          properties: {
            type: {
              type: 'STRING',
              enum: ['income', 'expense', 'all'],
              description: 'The type of categories to fetch.'
            }
          }
        }
      }
    ]
  }
];

export const sendToGemini = async (
  messages: ChatMessage[],
  snapshot: FinancialSnapshot,
  currencyCode: string,
  currencySymbol: string,
  apiKey?: string
): Promise<GeminiResponse> => {
  const systemInstruction = buildSystemInstruction(snapshot, currencyCode, currencySymbol);
  const modelChain = buildModelChain();

  if (modelChain.length === 0) {
    throw new Error('No available models for chat. Check your API key and try again.');
  }

  const activeKey = apiKey || getApiKey();
  if (!activeKey) throw new Error('Gemini API Key is missing.');

  const apiContents = buildApiContents(messages);
  const lastError: Error[] = [];

  for (const model of modelChain) {
    try {
      const apiUrl = `${GEMINI_BASE_URL}/${model.apiName}:generateContent`;

      const response = await fetch(`${apiUrl}?key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: apiContents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          tools: AGENT_TOOLS,
          generationConfig: {
            temperature: model.temperature ?? 0.4,
            maxOutputTokens: model.maxOutputTokens ?? 2048,
          },
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errorMsg = errJson?.error?.message || `Gemini API error: ${response.status}`;

        if (response.status === 404 || response.status === 403) {
          markModelUnavailable(model.id);
        }

        lastError.push(new Error(errorMsg));
        continue;
      }

      const data = await response.json();
      const candidatePart = data?.candidates?.[0]?.content?.parts?.[0];
      
      if (!candidatePart) {
        throw new Error('No response generated from the AI model.');
      }

      if (candidatePart.functionCall) {
        return {
          functionCall: {
            name: candidatePart.functionCall.name,
            args: candidatePart.functionCall.args,
          }
        };
      }

      return { text: candidatePart.text || '' };
    } catch (error: any) {
      lastError.push(error);
    }
  }

  throw new Error(
    lastError.length > 0
      ? lastError[lastError.length - 1].message
      : 'All available models failed to generate a response.'
  );
};

/** ── Shared request builder ─────────────────────────────────────────────────── */

const buildApiContents = (messages: ChatMessage[]) =>
  messages.map(msg => {
    const parts: any[] = [];
    if (msg.functionCall) {
      parts.push({ functionCall: { name: msg.functionCall.name, args: msg.functionCall.args } });
    } else if (msg.functionResponse) {
      parts.push({ functionResponse: { name: msg.functionResponse.name, response: msg.functionResponse.response } });
    } else {
      parts.push({ text: msg.content });
      if (msg.image) {
        parts.push({ inlineData: { mimeType: msg.image.mimeType, data: msg.image.data } });
      }
    }
    return { role: msg.role === 'user' ? 'user' : 'model', parts };
  });

const buildSystemInstruction = (
  snapshot: FinancialSnapshot,
  currencyCode: string,
  currencySymbol: string
): string => {
  const snapshotText = formatSnapshotForAI(snapshot, currencySymbol);
  return `You are Ledger AI — a personal financial copilot and smart agent embedded in the user's expense tracker app.
You have access to the user's real financial data (shown below) and you can actively perform operations on their behalf (e.g., adding expenses, incomes, transfers, and loans) using your tools.

Instructions:
- Base answers on the actual data provided. Never make up figures or invent transactions.
- Formatting: Format responses using Markdown (use **bold**, bullet lists, and headers (##) where helpful).
- Currency: Use the user's currency (${currencyCode} / ${currencySymbol}) for all monetary values.
- Friendly and actionable: Be concise and explain clearly when you perform actions.
- Missing Fields: If the user requests an action (like adding a transaction or loan) but fails to specify mandatory information (like the amount or which account to use), DO NOT attempt to call the tool. Instead, ask the user to clarify or provide the missing field(s).
- Creating Loans: When recording a loan, both a loan entry and a corresponding transaction entry (to update the account balance) will be created. Always check if the account name is specified or clear.

${snapshotText}`;
};

const buildModelChain = () => {
  const preferredModelId = localStorage.getItem('ai_preferred_model_id');
  const modelIds = preferredModelId
    ? [preferredModelId, ...selectModelChain('chat')]
    : selectModelChain('chat');
  return modelIds.map(id => resolveModel(id, 'chat')).filter(m => m.isAvailable);
};

/** Parse a Gemini SSE stream and yield each text delta */
async function* streamGeminiResponse(
  apiUrl: string,
  apiKey: string,
  body: any
): AsyncGenerator<{ textDelta?: string; functionCall?: { name: string; args: any } }, void, undefined> {
  const response = await fetch(`${apiUrl}:streamGenerateContent?alt=sse&key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => ({}));
    throw new Error(errJson?.error?.message || `Gemini API error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]' || jsonStr === 'done') continue;

      try {
        const data = JSON.parse(jsonStr);
        const part = data?.candidates?.[0]?.content?.parts?.[0];
        if (!part) continue;

        if (part.functionCall) {
          yield { functionCall: { name: part.functionCall.name, args: part.functionCall.args } };
        } else if (part.text) {
          yield { textDelta: part.text };
        }
      } catch {
        // skip malformed SSE data
      }
    }
  }
}

/**
 * Send messages to Gemini and stream the response text chunk-by-chunk.
 * Calls onChunk with each text fragment as it arrives.
 * Returns the final GeminiResponse (for functionCall detection).
 */
export const sendToGeminiStream = async (
  messages: ChatMessage[],
  snapshot: FinancialSnapshot,
  currencyCode: string,
  currencySymbol: string,
  onChunk: (text: string) => void,
  apiKey?: string
): Promise<GeminiResponse> => {
  const systemInstruction = buildSystemInstruction(snapshot, currencyCode, currencySymbol);
  const modelChain = buildModelChain();

  if (modelChain.length === 0) {
    throw new Error('No available models for chat. Check your API key and try again.');
  }

  const activeKey = apiKey || getApiKey();
  if (!activeKey) throw new Error('Gemini API Key is missing.');

  const apiContents = buildApiContents(messages);
  const lastError: Error[] = [];

  for (const model of modelChain) {
    try {
      const apiUrl = `${GEMINI_BASE_URL}/${model.apiName}`;
      let accumulatedText = '';
      let functionCallResult: GeminiResponse['functionCall'];

      const stream = streamGeminiResponse(apiUrl, activeKey, {
        contents: apiContents,
        systemInstruction: { parts: [{ text: systemInstruction }] },
        tools: AGENT_TOOLS,
        generationConfig: {
          temperature: model.temperature ?? 0.4,
          maxOutputTokens: model.maxOutputTokens ?? 2048,
        },
      });

      for await (const chunk of stream) {
        if (chunk.functionCall) {
          functionCallResult = chunk.functionCall;
          break;
        }
        if (chunk.textDelta) {
          accumulatedText += chunk.textDelta;
          onChunk(accumulatedText);
        }
      }

      if (functionCallResult) {
        return { functionCall: functionCallResult };
      }

      return { text: accumulatedText };
    } catch (error: any) {
      if (error.message?.includes('404') || error.message?.includes('403') || error.message?.includes('not found')) {
        markModelUnavailable(model.id);
      }
      lastError.push(error);
    }
  }

  throw new Error(
    lastError.length > 0
      ? lastError[lastError.length - 1].message
      : 'All available models failed to generate a response.'
  );
};

/** List all chat sessions for a user from Firestore */
export const listSessions = async (
  uid: string
): Promise<{ sessionId: string; updatedAt: string; title: string }[]> => {
  try {
    const ref = collection(firestore, 'users', uid, 'ai_sessions');
    const q = query(ref, orderBy('updatedAt', 'desc'));
    const snap = await getDocs(q);
    const list: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const messages = data.messages || [];
      let title = 'New Conversation';
      
      // Find the first user text message or note
      const firstUserMsg = messages.find((m: any) => m.role === 'user' && m.content);
      if (firstUserMsg) {
        title = firstUserMsg.content.length > 40
          ? firstUserMsg.content.slice(0, 40) + '...'
          : firstUserMsg.content;
      } else if (messages.length > 0) {
        title = 'Image Upload Chat';
      }
      
      list.push({
        sessionId: docSnap.id,
        updatedAt: data.updatedAt || new Date().toISOString(),
        title
      });
    });
    return list;
  } catch (e) {
    console.error('[aiChatService] Failed to list sessions:', e);
    return [];
  }
};

/** Delete a chat session document in Firestore */
export const deleteSession = async (uid: string, sessionId: string): Promise<void> => {
  try {
    const ref = getSessionDocRef(uid, sessionId);
    await deleteDoc(ref);
  } catch (e) {
    console.error('[aiChatService] Failed to delete session:', e);
    throw e;
  }
};
