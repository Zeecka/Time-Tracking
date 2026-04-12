/**
 * OIDC / OAuth2 configuration helpers.
 *
 * When REACT_APP_OIDC_AUTHORITY and REACT_APP_OIDC_CLIENT_ID are set at build
 * time the application runs in authenticated mode: unauthenticated users are
 * redirected to the identity provider before they can access any content.
 *
 * When those variables are absent (the default) the application is open to
 * everyone, preserving full backwards-compatibility.
 */

const OIDC_AUTHORITY = process.env.REACT_APP_OIDC_AUTHORITY || '';
const OIDC_CLIENT_ID = process.env.REACT_APP_OIDC_CLIENT_ID || '';

/** True when OAuth is enabled for this build. */
export const isOidcEnabled = Boolean(OIDC_AUTHORITY && OIDC_CLIENT_ID);

/**
 * Configuration object for `react-oidc-context`'s `<AuthProvider>`.
 * `null` when OAuth is disabled.
 */
export const oidcConfig = isOidcEnabled
  ? {
      authority: OIDC_AUTHORITY,
      client_id: OIDC_CLIENT_ID,
      redirect_uri:
        process.env.REACT_APP_OIDC_REDIRECT_URI || window.location.origin,
      post_logout_redirect_uri:
        process.env.REACT_APP_OIDC_REDIRECT_URI || window.location.origin,
      scope: process.env.REACT_APP_OIDC_SCOPE || 'openid profile email',
    }
  : null;
