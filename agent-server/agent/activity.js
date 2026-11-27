'use strict';

/**
 * Agent activity / task log, persisted in Firestore.
 * Collection: agent_tasks/{taskId}
 */

const { randomUUID } = require('crypto');

const recent = new Map(); // id -> task (in-memory cache)

function nowIso() {
  return new Date().toISOString();
}

function stripUndefined(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function persist(db, task) {
  if (!db) return;
  try {
    await db.collection('agent_tasks').doc(task.id).set(stripUndefined(task), { merge: true });
  } catch (e) {
    console.warn('[AgentActivity] persist failed:', e.message);
  }
}

async function createTask(db, { accountId, requesterNumber, requesterName, instruction }) {
  const id = randomUUID();
  const task = {
    id,
    accountId: accountId || null,
    requesterNumber: requesterNumber || null,
    requesterName: requesterName || null,
    instruction: instruction || '',
    status: 'queued',
    steps: [],
    summary: null,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  recent.set(id, task);
  await persist(db, task);
  return task;
}

async function addStep(db, task, step) {
  if (!task) return null;
  task.steps.push({ at: nowIso(), ...step });
  task.updatedAt = nowIso();
  await persist(db, task);
  return task;
}

async function updateTask(db, task, patch) {
  if (!task) return null;
  Object.assign(task, patch, { updatedAt: nowIso() });
  await persist(db, task);
  return task;
}

async function getTask(db, id) {
  if (recent.has(id)) return recent.get(id);
  if (!db) return null;
  try {
    const snap = await db.collection('agent_tasks').doc(id).get();
    if (!snap.exists) return null;
    const task = snap.data();
    recent.set(id, task);
    return task;
  } catch {
    return null;
  }
}

async function listTasks(db, { accountId, limit = 50 } = {}) {
  if (!db) return [];
  try {
    // Fetch recent docs then filter/sort in memory so no composite index is required.
    const snap = await db.collection('agent_tasks').limit(300).get();
    let tasks = snap.docs.map((d) => d.data());
    if (accountId) tasks = tasks.filter((t) => t.accountId === accountId);
    tasks.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    tasks = tasks.slice(0, limit);
    tasks.forEach((t) => recent.set(t.id, t));
    return tasks;
  } catch (e) {
    console.warn('[AgentActivity] list failed:', e.message);
    return [];
  }
}

module.exports = { createTask, addStep, updateTask, getTask, listTasks };
