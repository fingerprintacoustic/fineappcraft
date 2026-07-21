/**
 * deploy-function.js
 *
 * Reference backend for AppForge's "Deploy my app" button.
 * Run this as a Firebase Cloud Function (or any small Node server) — NEVER
 * in the browser. It's the one piece that knows your Netlify/Vercel tokens,
 * so the customer never sees them or even knows those services are involved.
 *
 * Set your tokens as environment config, not hard-coded:
 *   firebase functions:config:set netlify.token="YOUR_TOKEN" vercel.token="YOUR_TOKEN"
 *
 * Front-end calls this with: { html: "<the assembled app>", host: "netlify" | "vercel" | "own" }
 * and gets back: { url: "https://something.example" }
 */

const functions = require('firebase-functions');
const fetch = require('node-fetch');
const JSZip = require('jszip');

exports.deploy = functions.https.onRequest(async (req, res) => {
  // Lock this down further in production: verify a request token / rate-limit
  // per customer so strangers can't spam free deploys under your accounts.
  res.set('Access-Control-Allow-Origin', '*'); // restrict to your storefront's domain in production

  const { html, host } = req.body;
  if (!html || !host) {
    return res.status(400).json({ error: 'Missing html or host' });
  }

  try {
    if (host === 'netlify') {
      const url = await deployToNetlify(html);
      return res.json({ url });
    }
    if (host === 'vercel') {
      const url = await deployToVercel(html);
      return res.json({ url });
    }
    // host === 'own' — nothing to deploy; the front-end just offers a download.
    return res.json({ url: null });
  } catch (err) {
    console.error('Deploy failed:', err);
    return res.status(500).json({ error: 'Deploy failed' });
  }
});

async function deployToNetlify(html) {
  const token = functions.config().netlify.token;
  const zip = new JSZip();
  zip.file('index.html', html);
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const createRes = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/zip',
    },
    body: zipBuffer,
  });
  const site = await createRes.json();
  return site.ssl_url || site.url;
}

async function deployToVercel(html) {
  const token = functions.config().vercel.token;
  const createRes = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'appforge-site',
      files: [{ file: 'index.html', data: Buffer.from(html).toString('base64'), encoding: 'base64' }],
      target: 'production',
    }),
  });
  const deployment = await createRes.json();
  return `https://${deployment.url}`;
}
