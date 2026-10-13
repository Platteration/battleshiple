// @ts-check
// What the website sells through server/kit (sign in with Google, Stripe Checkout and its
// webhook): one "Support this app" payment and nothing else. It changes nothing in the game. A
// paid checkout grants the entitlement `supporter`, which `GET api/me` then reports, and the
// web build's About card thanks a supporter for it (src/account.tsx, src/about.ts). Its Stripe
// Price id is STRIPE_PRICE_SUPPORTER. The phone apps sell nothing and never reach this file.
//
// The kit checks this at start-up and throws on a malformed one (an unknown field included),
// and server/api.test.mjs holds it to what the app's own code asks for.

export default {
  app: 'battleshiple',
  name: 'Battleshiple',
  products: [
    {
      id: 'supporter',
      name: 'Support this app',
      description: 'A one-time payment towards Battleshiple. It changes nothing in the game: every rule, fleet and computer skill stays the same for everyone.',
      mode: 'payment',
      grants: 'supporter',
    },
  ],
};
