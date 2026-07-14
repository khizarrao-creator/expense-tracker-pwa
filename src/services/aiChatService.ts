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
import { getApiKey, markModelUnavailable, recordApiRequest } from './ai';
import { selectModelChain } from './ai/router';
import { resolveModel } from './ai/modelRegistry';

const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models`;

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  thought?: string; // The model's reasoning/thought process
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
  thought?: string; // The model's reasoning/thought process
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

const removeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefined(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        newObj[key] = removeUndefined(val);
      }
    }
    return newObj;
  }
  return obj;
};

/** Append a message to the Firestore session */
export const saveMessage = async (uid: string, sessionId: string, message: ChatMessage): Promise<void> => {
  try {
    const ref = getSessionDocRef(uid, sessionId);
    const snap = await getDoc(ref);

    // Strip large base64 data to avoid 1MB document size limit, use Cloudinary URL instead
    const sanitizedMessage = removeUndefined({ ...message });
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
      },
      // ─── WhatsApp Tools ───────────────────────────────────────────────────
      {
        name: 'get_whatsapp_status',
        description: 'Check the connection status of all WhatsApp accounts (Primary, Secondary, Work). Returns which accounts are connected, disconnected, or waiting for QR scan.',
        parameters: { type: 'OBJECT', properties: {} }
      },
      {
        name: 'init_whatsapp',
        description: 'Initiate or reconnect a WhatsApp account. This starts the QR code linking process. Tell the user to visit the WhatsApp page to scan the QR code after calling this.',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              enum: ['account1', 'account2', 'account3'],
              description: 'The account to initiate. account1 = Primary Account, account2 = Secondary Account, account3 = Work Account.'
            }
          },
          required: ['accountId']
        }
      },
      {
        name: 'logout_whatsapp',
        description: 'Disconnect and unlink a WhatsApp account. This logs out the session and clears credentials.',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              enum: ['account1', 'account2', 'account3'],
              description: 'The account to disconnect. account1 = Primary Account, account2 = Secondary Account, account3 = Work Account.'
            }
          },
          required: ['accountId']
        }
      },
      {
        name: 'get_whatsapp_contacts',
        description: 'Retrieve the list of contacts saved for a connected WhatsApp account.',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              enum: ['account1', 'account2', 'account3'],
              description: 'The WhatsApp account to fetch contacts from.'
            }
          },
          required: ['accountId']
        }
      },
      {
        name: 'get_whatsapp_messages',
        description: 'Read the message history with a specific contact on a WhatsApp account. Requires the contact JID (e.g., 923001234567@s.whatsapp.net).',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              enum: ['account1', 'account2', 'account3'],
              description: 'The WhatsApp account to read messages from.'
            },
            jid: {
              type: 'STRING',
              description: 'The contact JID in the format: <phone_number>@s.whatsapp.net. Get this from get_whatsapp_contacts if unknown.'
            }
          },
          required: ['accountId', 'jid']
        }
      },
      {
        name: 'send_whatsapp_message',
        description: 'Send a WhatsApp message to a phone number from a connected account.',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              enum: ['account1', 'account2', 'account3'],
              description: 'The WhatsApp account to send from.'
            },
            phone: {
              type: 'STRING',
              description: 'The recipient phone number. Can be local (0312...) or international (923...). Digits only.'
            },
            message: {
              type: 'STRING',
              description: 'The text message content to send.'
            }
          },
          required: ['accountId', 'phone', 'message']
        }
      },
      {
        name: 'delete_whatsapp_message',
        description: 'Delete a WhatsApp message. Can delete just for yourself ("for me") or for everyone in the chat ("for everyone", only works for messages sent by you).',
        parameters: {
          type: 'OBJECT',
          properties: {
            accountId: {
              type: 'STRING',
              enum: ['account1', 'account2', 'account3'],
              description: 'The WhatsApp account that owns the message.'
            },
            jid: {
              type: 'STRING',
              description: 'The chat JID where the message exists (e.g., 923001234567@s.whatsapp.net).'
            },
            messageId: {
              type: 'STRING',
              description: 'The unique message ID to delete. Get this from get_whatsapp_messages.'
            },
            fromMe: {
              type: 'BOOLEAN',
              description: 'Whether this message was sent by the user (true) or received (false).'
            },
            everyone: {
              type: 'BOOLEAN',
              description: 'If true, delete for everyone in the chat. If false, delete only for yourself. Deleting for everyone only works for messages sent by you.'
            }
          },
          required: ['accountId', 'jid', 'messageId', 'fromMe', 'everyone']
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
  apiKey?: string,
  mode?: 'thinking' | 'fast'
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
      const isGemma = model.apiName.startsWith('gemma');
      const baseUrl = isGemma
        ? 'https://generativelanguage.googleapis.com/v1/models'
        : GEMINI_BASE_URL;
      const apiUrl = `${baseUrl}/${model.apiName}:generateContent`;

      let modelContents = apiContents;
      if (isGemma) {
        modelContents = apiContents
          .filter(c => c.parts.some(p => p.text))
          .map((c, idx) => {
            if (idx === 0 && c.role === 'user') {
              const textParts = c.parts.filter(p => p.text);
              if (textParts.length > 0) {
                return {
                  role: 'user',
                  parts: [
                    { text: `${systemInstruction}\n\nUser Query:\n${textParts[0].text}` },
                    ...textParts.slice(1)
                  ]
                };
              }
            }
            return {
              role: c.role,
              parts: c.parts.filter(p => p.text)
            };
          });
      }

      const body: any = {
        contents: modelContents,
        generationConfig: {
          temperature: model.temperature ?? 0.4,
          maxOutputTokens: model.maxOutputTokens ?? 2048,
        },
      };

      if (!isGemma) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
        body.tools = AGENT_TOOLS;
        body.generationConfig.thinkingConfig = {
          thinkingBudget: mode === 'fast' ? 0 : 2048
        };
      }

      const response = await fetch(`${apiUrl}?key=${activeKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      const candidateParts = data?.candidates?.[0]?.content?.parts || [];
      
      let text = '';
      let thought = '';
      let functionCall: GeminiResponse['functionCall'] = undefined;

      const textParts = candidateParts.filter((p: any) => p.text && !p.thought);
      const thoughtParts = candidateParts.filter((p: any) => p.thought);

      if (thoughtParts.length > 0) {
        thought = thoughtParts.map((p: any) => p.text).join('');
      }

      if (textParts.length > 1 && thoughtParts.length === 0) {
        const responsePart = textParts[textParts.length - 1];
        text = responsePart.text || '';
        const preceding = textParts.slice(0, textParts.length - 1);
        thought = preceding.map((p: any) => p.text).join('\n');
      } else {
        text = textParts.map((p: any) => p.text).join('');
      }

      for (const part of candidateParts) {
        if (part.functionCall) {
          functionCall = {
            name: part.functionCall.name,
            args: part.functionCall.args,
          };
        }
      }

      if (functionCall) {
        return { functionCall };
      }

      if (text.length === 0 && thought.length === 0) {
        throw new Error('No response generated from the AI model.');
      }

      return { text, thought: thought || undefined };
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

## WhatsApp Capabilities
You also have access to the user's WhatsApp accounts. The system supports 3 accounts:
- **account1** = Primary Account
- **account2** = Secondary Account  
- **account3** = Work Account

You can:
- **Check status**: Use get_whatsapp_status to see which accounts are connected/disconnected.
- **Connect**: Use init_whatsapp to start linking an account (user scans QR in the WhatsApp page).
- **Disconnect**: Use logout_whatsapp to unlink an account.
- **Contacts**: Use get_whatsapp_contacts to list saved contacts for a connected account.
- **Read messages**: Use get_whatsapp_messages with the contact's JID to retrieve chat history.
- **Send messages**: Use send_whatsapp_message to send a text to any phone number.
- **Delete messages**: Use delete_whatsapp_message to delete for yourself or for everyone (own messages only).

WhatsApp Rules:
- Always call get_whatsapp_status first if unsure whether an account is connected before attempting to send/read.
- For get_whatsapp_messages, you need the contact JID. Use get_whatsapp_contacts first to find the right JID if the user provides a name.
- When sending messages, confirm the recipient and message text with the user before sending.
- Deleting "for everyone" is only possible for messages sent BY the user (fromMe: true).

${snapshotText}`;
};

const buildModelChain = () => {
  const preferredModelId = localStorage.getItem('ai_preferred_model_id');
  const modelIds = preferredModelId
    ? [preferredModelId, ...selectModelChain('chat')]
    : selectModelChain('chat');
  return modelIds.map(id => resolveModel(id, 'chat')).filter(m => m.isAvailable);
};

/** Parse a Gemini SSE stream and yield each text/thought delta */
async function* streamGeminiResponse(
  apiUrl: string,
  apiKey: string,
  body: any
): AsyncGenerator<{ textDelta?: string; thoughtDelta?: string; functionCall?: { name: string; args: any } }, void, undefined> {
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
        const usage = data.usageMetadata;
        const candidatesCount = usage?.candidatesTokenCount || 0;
        const thoughtsCount = usage?.thoughtsTokenCount || 0;

        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.functionCall) {
            yield { functionCall: { name: part.functionCall.name, args: part.functionCall.args } };
          } else if (part.text) {
            const isThought = part.thought === true || (candidatesCount === 0 && thoughtsCount > 0);
            if (isThought) {
              yield { thoughtDelta: part.text };
            } else {
              yield { textDelta: part.text };
            }
          }
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
  apiKey?: string,
  onThoughtChunk?: (text: string) => void,
  mode?: 'thinking' | 'fast'
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
      const isGemma = model.apiName.startsWith('gemma');
      const baseUrl = isGemma
        ? 'https://generativelanguage.googleapis.com/v1/models'
        : GEMINI_BASE_URL;
      const apiUrl = `${baseUrl}/${model.apiName}`;
      let accumulatedText = '';
      let accumulatedThought = '';
      let functionCallResult: GeminiResponse['functionCall'];

      let modelContents = apiContents;
      if (isGemma) {
        modelContents = apiContents
          .filter(c => c.parts.some(p => p.text))
          .map((c, idx) => {
            if (idx === 0 && c.role === 'user') {
              const textParts = c.parts.filter(p => p.text);
              if (textParts.length > 0) {
                return {
                  role: 'user',
                  parts: [
                    { text: `${systemInstruction}\n\nUser Query:\n${textParts[0].text}` },
                    ...textParts.slice(1)
                  ]
                };
              }
            }
            return {
              role: c.role,
              parts: c.parts.filter(p => p.text)
            };
          });
      }

      const body: any = {
        contents: modelContents,
        generationConfig: {
          temperature: model.temperature ?? 0.4,
          maxOutputTokens: model.maxOutputTokens ?? 2048,
        },
      };

      if (!isGemma) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
        body.tools = AGENT_TOOLS;
        body.generationConfig.thinkingConfig = {
          thinkingBudget: mode === 'fast' ? 0 : 2048
        };
      }

      const stream = streamGeminiResponse(apiUrl, activeKey, body);

      for await (const chunk of stream) {
        if (chunk.functionCall) {
          functionCallResult = chunk.functionCall;
          break;
        }
        if (chunk.thoughtDelta) {
          accumulatedThought += chunk.thoughtDelta;
          if (onThoughtChunk) onThoughtChunk(accumulatedThought);
        }
        if (chunk.textDelta) {
          accumulatedText += chunk.textDelta;
          onChunk(accumulatedText);
        }
      }

      if (functionCallResult) {
        const totalChars = systemInstruction.length + 
          messages.reduce((acc, m) => acc + (m.content?.length || 0), 0) + 
          JSON.stringify(functionCallResult).length;
        recordApiRequest(Math.ceil(totalChars / 4));
        return { functionCall: functionCallResult };
      }

      const totalChars = systemInstruction.length + 
        messages.reduce((acc, m) => acc + (m.content?.length || 0), 0) + 
        accumulatedText.length + 
        accumulatedThought.length;
      recordApiRequest(Math.ceil(totalChars / 4));

      return { text: accumulatedText, thought: accumulatedThought || undefined };
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
