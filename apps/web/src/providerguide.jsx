// Galdus.ai
// Copyright (C) 2026 Mario Cubello
// Author: Mario Cubello
// SPDX-License-Identifier: AGPL-3.0-only

import React, { useEffect, useState } from 'react';
import { BASE } from './paths';

// How to get a key for each provider in the catalog. Monograms are drawn in the brand palette (no third-party logos).
export const GUIDE = {
  openai: { tag: 'Pay as you go', short: 'OA', tint: '#10A37F', url: 'https://platform.openai.com/api-keys', site: 'platform.openai.com', prefix: 'sk-',
    blurb: 'GPT models from OpenAI.', cost: 'Pay as you go. Add a small credit in Billing first.',
    steps: ['Sign in at platform.openai.com', 'Open API keys and choose Create new secret key', 'Copy the key: it is shown only once'] },
  anthropic: { tag: 'Pay as you go', short: 'AN', tint: '#D4A27F', url: 'https://console.anthropic.com/settings/keys', site: 'console.anthropic.com', prefix: 'sk-ant-',
    blurb: 'Claude models from Anthropic.', cost: 'Pay as you go. Add credit under Billing.',
    steps: ['Sign in at console.anthropic.com', 'Open Settings, then API keys, and choose Create key', 'Copy the key that starts with sk-ant-'] },
  gemini: { tag: 'Free tier', short: 'GE', tint: '#4F8DF5', url: 'https://aistudio.google.com/app/apikey', site: 'aistudio.google.com', prefix: 'AIza',
    blurb: 'Gemini models from Google.', cost: 'Free tier available, with rate limits.',
    steps: ['Sign in at aistudio.google.com with your Google account', 'Choose Get API key, then Create API key', 'Copy the key that starts with AIza'] },
  mistral: { tag: 'Free tier', short: 'MI', tint: '#FA7A35', url: 'https://console.mistral.ai/api-keys', site: 'console.mistral.ai', prefix: '',
    blurb: 'Mistral models, made in Europe.', cost: 'Free experiment plan or pay as you go.',
    steps: ['Sign in at console.mistral.ai', 'Open API keys and choose Create new key', 'Copy the key'] },
  deepseek: { tag: 'Low cost', short: 'DS', tint: '#4D6BFE', url: 'https://platform.deepseek.com/api_keys', site: 'platform.deepseek.com', prefix: 'sk-',
    blurb: 'DeepSeek chat and reasoning models.', cost: 'Pay as you go, low prices. Top up first.',
    steps: ['Sign in at platform.deepseek.com', 'Open API keys and choose Create new API key', 'Copy the key that starts with sk-'] },
  openrouter: { tag: 'Free models', short: 'OR', tint: '#B6FF00', url: 'https://openrouter.ai/settings/keys', site: 'openrouter.ai', prefix: 'sk-or-',
    blurb: 'One key for hundreds of models: Qwen, DeepSeek, Llama, Mistral, Claude, GPT.', cost: 'Pay as you go. Several models are free.',
    steps: ['Sign in at openrouter.ai', 'Open Keys and choose Create key', 'Copy the key that starts with sk-or-'] },
  groq: { tag: 'Free tier', short: 'GQ', tint: '#F55036', url: 'https://console.groq.com/keys', site: 'console.groq.com', prefix: 'gsk_',
    blurb: 'Very fast open-weight models (Llama, Qwen).', cost: 'Free tier available.',
    steps: ['Sign in at console.groq.com', 'Open API Keys and choose Create API key', 'Copy the key that starts with gsk_'] },
  together_ai: { tag: 'Starter credit', short: 'TG', tint: '#3D8BFF', url: 'https://api.together.ai/settings/api-keys', site: 'api.together.ai', prefix: '',
    blurb: 'Open-weight models hosted by Together AI.', cost: 'Pay as you go, with starter credit.',
    steps: ['Sign in at api.together.ai', 'Open Settings, then API keys', 'Copy your key'] },
  fireworks_ai: { tag: 'Starter credit', short: 'FW', tint: '#7A5CFF', url: 'https://fireworks.ai/account/api-keys', site: 'fireworks.ai', prefix: 'fw_',
    blurb: 'Open-weight models hosted by Fireworks AI.', cost: 'Pay as you go, with starter credit.',
    steps: ['Sign in at fireworks.ai', 'Open Account, then API keys, and create a key', 'Copy the key'] },
  xai: { tag: 'Pay as you go', short: 'xA', tint: '#E8EEF6', url: 'https://console.x.ai', site: 'console.x.ai', prefix: 'xai-',
    blurb: 'Grok models from xAI.', cost: 'Pay as you go.',
    steps: ['Sign in at console.x.ai', 'Open API keys and choose Create API key', 'Copy the key that starts with xai-'] },
  ollama: { tag: 'Self-hosted', short: 'OL', tint: '#F8FAFC', url: 'https://ollama.com/download', site: 'ollama.com', self: true,
    blurb: 'Run open-weight models on your own server.', cost: 'Free software. You run the hardware.',
    steps: ['Install Ollama on a server and pull a model, for example ollama pull qwen2.5:7b', 'Publish it over https (a reverse proxy or a tunnel)', 'Paste the https address here'] },
  openai_compatible: { tag: 'Self-hosted', short: 'API', tint: '#FFC107', url: 'https://docs.vllm.ai', site: 'your server', self: true,
    blurb: 'Any OpenAI-compatible server: vLLM, LM Studio, TGI, LocalAI.', cost: 'You run the hardware.',
    steps: ['Start the server with its OpenAI-compatible API enabled', 'Publish it over https, ending in /v1', 'Paste the address and, if the server needs one, its key'] },
};

// Official provider logos are not bundled (trademarks): drop the provider's own SVG from its brand kit into
// public/brand/providers/<id>.svg and it is shown here, recoloured to the platform palette.
const logoState = new Map();
function useLogo(id) {
  const url = `${BASE}/brand/providers/${id}.svg`;
  const [ok, setOk] = useState(logoState.get(id));
  useEffect(() => {
    if (logoState.has(id)) { setOk(logoState.get(id)); return undefined; }
    let live = true;
    const img = new Image();
    img.onload = () => { logoState.set(id, true); if (live) setOk(true); };
    img.onerror = () => { logoState.set(id, false); if (live) setOk(false); };
    img.src = url;
    return () => { live = false; };
  }, [id, url]);
  return ok ? url : null;
}

export function ProviderMark({ id, size = 28 }) {
  const g = GUIDE[id] || { short: '?', tint: '#B6FF00' };
  const logo = useLogo(id);
  if (logo) {
    return (
      <span className="pmark logo" style={{ width: size, height: size, '--tint': g.tint }} aria-hidden="true">
        <span style={{ WebkitMaskImage: `url(${logo})`, maskImage: `url(${logo})` }} />
      </span>
    );
  }
  return (
    <span className="pmark" style={{ width: size, height: size, '--tint': g.tint, fontSize: size * (g.short.length > 2 ? .32 : .38) }} aria-hidden="true">
      {g.short}
    </span>
  );
}
