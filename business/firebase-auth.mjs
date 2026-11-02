let instance;
export async function registrationAuth() {
  if (!['dutt.gr', 'www.dutt.gr'].includes(location.hostname) || location.protocol !== 'https:') throw new Error('local_auth_not_configured');
  instance ??= (async () => {
    const [{ initializeApp }, sdk] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js'),
    ]);
    const app = initializeApp({ apiKey: 'AIzaSyDAZdgl5dmi9re0dkdsfEGeiWweWgXnfzg', appId: '1:85364465922:web:a758a14a9c1ad94dd7e21b',
      authDomain: 'sendygo-cd034.firebaseapp.com', projectId: 'sendygo-cd034' }, 'dutt-business-registration');
    const auth = sdk.initializeAuth(app, { persistence: sdk.browserSessionPersistence });
    await auth.authStateReady();
    let protection, protectionSdk, siteKey;
    return { current: async () => auth.currentUser, subscribe: callback => sdk.onAuthStateChanged(auth, callback), create: async (email, password) => (await sdk.createUserWithEmailAndPassword(auth, email, password)).user,
      token: user => user.getIdToken(), signIn: async (email, password) => (await sdk.signInWithEmailAndPassword(auth, email, password)).user,
      signOut: () => sdk.signOut(auth), refresh: async () => { if (auth.currentUser) { await sdk.reload(auth.currentUser); await auth.currentUser.getIdToken(true); } return auth.currentUser; },
      verifyEmail: user => sdk.sendEmailVerification(user, { url: 'https://dutt.gr/business-access.html', handleCodeInApp: false }),
      protect: async key => {
        if (siteKey && siteKey !== key) throw new Error('app_check_configuration_changed');
        if (!protection) { protectionSdk = await import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-check.js');
          protection = protectionSdk.initializeAppCheck(app, { provider: new protectionSdk.ReCaptchaV3Provider(key), isTokenAutoRefreshEnabled: true }); siteKey = key; }
      },
      protectionToken: async () => { if (!protection) throw new Error('app_check_required'); return (await protectionSdk.getToken(protection, false)).token; } };
  })();
  try { return await instance; } catch (error) { instance = null; throw error; }
}
