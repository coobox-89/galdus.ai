import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useToast } from './ui';

const Ctx = createContext(null);
export const useWs = () => useContext(Ctx);

// Holds the session-wide workspace state every page needs.
export function WorkspaceProvider({ token, user, onExpired, children }) {
  const toast = useToast();
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState(() => localStorageGet('galdus_ws'));
  const [sources, setSources] = useState({ connections: [], platform: [], providers: [], loaded: false });
  const [collections, setCollections] = useState([]);
  const [version, setVersion] = useState(0);

  const onError = useCallback(err => {
    if (err?.status === 401) onExpired();
    else toast(err?.message || 'Something went wrong.', 'error');
  }, [onExpired, toast]);

  const loadOrgs = useCallback(() => api('/v1/auth/organizations', { token }).then(orgs => {
    setOrganizations(orgs);
    setOrganizationId(id => (orgs.some(o => o.id === id) ? id : orgs[0]?.id || ''));
  }).catch(onError), [token, onError]);
  useEffect(() => { loadOrgs(); }, [loadOrgs]);
  useEffect(() => { if (organizationId) localStorageSet('galdus_ws', organizationId); }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return undefined;
    let active = true;
    Promise.all([
      api('/v1/models/connections', { token, organizationId }),
      api('/v1/models', { token, organizationId }),
      api('/v1/models/providers', { token, organizationId }),
      api('/v1/knowledge/collections', { token, organizationId }),
    ]).then(([connections, platform, providers, cols]) => {
      if (!active) return;
      setSources({ connections, platform: platform.models, providers, loaded: true });
      setCollections(cols);
    }).catch(err => { if (active) { setSources(s => ({ ...s, loaded: true })); onError(err); } });
    return () => { active = false; };
  }, [token, organizationId, onError, version]);

  const value = useMemo(() => {
    const role = organizations.find(o => o.id === organizationId)?.role;
    return {
      token, user, organizations, organizationId, setOrganizationId, role,
      canManage: role === 'owner' || role === 'admin', isOwner: role === 'owner',
      sources, collections, onError, toast,
      refresh: () => setVersion(v => v + 1), reloadOrganizations: loadOrgs,
      call: (path, opts = {}) => api(path, { token, organizationId, ...opts }),
    };
  }, [token, user, organizations, organizationId, sources, collections, onError, toast, loadOrgs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function localStorageGet(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } }
