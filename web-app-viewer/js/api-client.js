/**
 * api-client.js
 * Wrapper fetch() ke URL Deployment Google Apps Script + Manajemen Sesi & Magic Link.
 */

const GAS_WEB_APP_URL = localStorage.getItem('gas_api_url') || 'https://script.google.com/macros/s/AKfycbwLnNIv3_3vR-1vq0qejIcUlKcEF7xVKW9prFE7_4fyCJd29vyLNS1X8UfqkFd7nCtm/exec';

const SessionState = {
  get authToken() {
    return localStorage.getItem('dokproyek_auth_token') || '';
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem('dokproyek_user') || 'null');
    } catch {
      return null;
    }
  },
  get magicToken() {
    return new URLSearchParams(window.location.search).get('token') || '';
  },
  saveUser(userObj) {
    localStorage.setItem('dokproyek_auth_token', userObj.authToken);
    localStorage.setItem('dokproyek_user', JSON.stringify(userObj));
  },
  clear() {
    localStorage.removeItem('dokproyek_auth_token');
    localStorage.removeItem('dokproyek_user');
  },
  isAdmin() {
    return !this.magicToken && this.user && this.user.role === 'ADMIN';
  }
};

async function callGasApi(action, payload = {}) {
  const silent = Boolean(payload._silent);
  const body = {
    action,
    ...payload
  };
  delete body._silent;

  if (SessionState.magicToken) {
    body.magicToken = SessionState.magicToken;
  } else if (SessionState.authToken) {
    body.authToken = SessionState.authToken;
    if (SessionState.isAdmin() && !body.adminToken) {
      body.adminToken = SessionState.authToken;
    }
  }

  if (!silent && typeof UiFeedback !== 'undefined') {
    UiFeedback.showLoading('Menghubungkan ke server...');
  }

  try {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (data.status === 'error' && data.code === 'WEB_SUBSCRIPTION_SUSPENDED') {
      if (window.App && typeof window.App.showWebSuspendedLock === 'function') {
        window.App.showWebSuspendedLock(data.message, data.storage?.vendorContactWa);
      }
      return data;
    }
    if (data.status === 'error' && (data.code === 'TOKEN_REVOKED' || data.code === 'UNAUTHORIZED')) {
      SessionState.clear();
      if (typeof UiFeedback !== 'undefined') {
        await UiFeedback.alert(data.message || 'Sesi berakhir atau akses telah dicabut Admin.', 'Sesi Berakhir');
      } else {
        alert(data.message || 'Sesi berakhir atau akses telah dicabut Admin.');
      }
      window.location.reload();
    }
    return data;
  } finally {
    if (!silent && typeof UiFeedback !== 'undefined') {
      UiFeedback.hideLoading();
    }
  }
}
