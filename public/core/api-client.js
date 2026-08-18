(function exposeApiClient(global) {
  'use strict';

  const core = global.SeoBuddyCore = global.SeoBuddyCore || {};

  function getAdminToken() {
    return global.sessionStorage.getItem('seo_admin_password') || '';
  }

  function authHeaders(base) {
    const headers = Object.assign({}, base || {});
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  async function authFetch(url, options) {
    const request = Object.assign({}, options || {});
    request.headers = authHeaders(request.headers);
    const response = await global.fetch(url, request);
    if (response.status === 401) {
      throw new Error('This action is locked. Enter the admin password in the Settings tab, then try again.');
    }
    return response;
  }

  Object.assign(core, { authFetch, authHeaders, getAdminToken });
})(window);
