// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import { API_BASE_URL } from './config';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function describe(status, data) {
  if (data && typeof data.detail === 'string') return data.detail;
  if (data && Array.isArray(data.detail)) return data.detail.map(d => d.msg).join('; ');
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'The service is temporarily unavailable. Please try again.';
  return 'Request failed.';
}

export async function api(path, { token, organizationId, method = 'GET', body, timeoutMs = 90000 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (organizationId) headers['X-Organization-Id'] = organizationId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ApiError(error.name === 'AbortError' ? 'The request timed out.' : 'Cannot reach the Galdus.ai API.', 0);
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new ApiError(describe(response.status, data), response.status);
  return data;
}
